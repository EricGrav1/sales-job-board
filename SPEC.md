# BUILD SPEC — Sales Job Board, Phase 2 (Employer-Paid Job Board)
*This document is written for an AI coding agent. All decisions are final. Do not substitute technologies, add features beyond the milestone scope, or skip acceptance criteria.*

*History: Phase 1 (rep profiles, proof uploads, admin review, milestones M1–M6) is specified in `docs/SPEC-phase1-rep-profiles.md` and stays in the codebase. The metrics/import engine is parked in `docs/PARKED-metrics-engine.md`.*

---

## 0. Project Summary

A job board for sales roles from entry level (SDR/BDR) to executive (VP/CRO), run like Indeed:

- **Employers are the paying customer.** They create a company account, post jobs, and pay to promote them. Promotion is **sponsored jobs**: the employer sets a daily budget and a cost per click, prepaid from a credit balance. Employers can also buy a **Premium** subscription, sold at a launch discount for the first 3 months.
- **Job seekers are free.** They search, filter and apply. Sales-specific fields (OTE, base/variable, commission-only, seniority level) are first-class.
- Rep profiles from Phase 1 remain. A job seeker's published profile is attached to their applications automatically.

## 1. Locked Technology Decisions

Everything in Phase 1 §1 remains locked (React 18 + Vite + Tailwind + React Router v6, Express + TypeScript, Drizzle + PostgreSQL, express-session + connect-pg-simple + bcrypt, R2, sharp, Resend, Zod, Vitest + Supertest). Additions:

| Layer | Choice | Notes |
|---|---|---|
| Payments | Stripe (`stripe` npm) via Checkout Sessions + Billing Portal + webhooks | No card data ever touches our server |
| Search | PostgreSQL full-text search (`websearch_to_tsquery`) with a GIN expression index | No search service |
| Money | Integer **cents** everywhere for credits and bids. Job pay ranges are whole dollars (as in Phase 1). | Never floats for money |

## 2. Repository Structure

Unchanged from Phase 1. New server files: `routes/jobs.ts`, `routes/employer.ts`, `routes/applications.ts`, `routes/billing.ts`, `services/stripe.ts`, `services/sponsored.ts`, `services/plans.ts`. New client pages under `client/src/pages`.

## 3. Environment Variables (fail fast at boot if missing)

```
DATABASE_URL
SESSION_SECRET
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
RESEND_API_KEY
APP_URL
ADMIN_EMAIL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PREMIUM_PRICE_ID          # recurring monthly price for Premium
STRIPE_LAUNCH_COUPON_ID          # optional; coupon with duration=repeating, duration_in_months=3
LAUNCH_PROMO_ENDS_AT             # optional ISO date; coupon auto-applied to Premium checkout before this date
```

In `production`, any Stripe variable whose value starts with `placeholder` is a boot error. In development, placeholder Stripe keys enable the dev fallback in §5 (Billing).

## 4. Database Schema Additions (Drizzle)

```ts
users.role enum gains 'employer'   → enum('rep','employer','admin')
events.type enum gains 'job_view','job_apply','job_publish'

companies: {
  id uuid pk
  name text not null
  slug text unique not null
  website text null                 // https only
  description text null             // max 2000
  sizeBand enum('1-10','11-50','51-200','201-1000','1000+') null
  plan enum('free','premium') default 'free'
  premiumCurrentPeriodEnd timestamp null
  stripeCustomerId text unique null
  stripeSubscriptionId text unique null
  creditBalanceCents integer not null default 0   // cached; creditLedger is the source of truth
  createdAt / updatedAt
}

companyMembers: { companyId fk cascade, userId fk cascade unique, role enum('owner') , PK(companyId,userId), createdAt }
  // MVP: one company per employer user, owner only. Team invites are a later milestone.

jobs: {
  id uuid pk
  companyId fk cascade
  createdByUserId fk -> users set null
  slug text unique not null         // "<title>-<company>-<6 char id>"
  title varchar(120) not null
  category enum('sdr_bdr','account_executive','account_manager','customer_success',
                'sales_engineer','sales_operations','channel_partnerships',
                'sales_management','sales_leadership','other') not null
  level enum('entry','mid','senior','manager','director','vp','executive') not null
  employmentType enum('full_time','part_time','contract','internship') not null
  workplace enum('onsite','hybrid','remote') not null
  location varchar(160) not null    // "Austin, TX" or "Remote (US)"
  compType enum('base_plus_commission','commission_only','salary_only') not null
  baseMin / baseMax integer null    // whole USD
  oteMin / oteMax integer null      // whole USD
  description text not null         // plain text, 100–10000 chars, rendered as text (no HTML)
  applyMethod enum('platform','external') not null default 'platform'
  applyUrl text null                // https only; required when external
  status enum('draft','published','closed') default 'draft'
  publishedAt timestamp null
  expiresAt timestamp null          // publishedAt + 30 days
  createdAt / updatedAt
  GIN index on to_tsvector('english', title || ' ' || description || ' ' || location)
}

applications: {
  id uuid pk
  jobId fk cascade
  userId fk cascade
  profileId fk -> repProfiles set null   // attached if applicant has a published profile
  fullName varchar(120) not null
  phone varchar(40) null
  linkedinUrl text null             // https://(www.)linkedin.com/... only
  resumeKey text null               // R2 key under resumes/<userId>/ — never public
  coverNote varchar(3000) null
  status enum('new','reviewed','interviewing','offer','hired','rejected') default 'new'
  createdAt / updatedAt
  UNIQUE(jobId, userId)
}

promotions: {                        // one per job
  id uuid pk
  jobId fk cascade unique
  companyId fk cascade
  status enum('active','paused') default 'active'
  dailyBudgetCents integer not null  // min 500 ($5)
  cpcCents integer not null          // min 25, max 2000
  createdAt / updatedAt
}

promotionDailyStats: {               // powers analytics AND daily budget enforcement
  promotionId fk cascade
  day date                           // UTC
  impressions integer default 0
  clicks integer default 0
  chargedClicks integer default 0
  spendCents integer default 0
  PK(promotionId, day)
}

promotionClicks: {                   // audit + de-duplication
  id uuid pk
  promotionId fk cascade
  day date
  viewerHash text not null           // HMAC(SESSION_SECRET, userId | ip+user-agent); raw IPs never stored
  chargedCents integer not null      // 0 when not billable
  createdAt
  UNIQUE(promotionId, day, viewerHash)
}

creditLedger: {
  id uuid pk
  companyId fk cascade
  amountCents integer not null       // + top-up, − click charge
  type enum('topup','click','adjustment')
  stripeCheckoutSessionId text unique null   // idempotency for top-ups
  promotionClickId uuid null
  createdAt
}

stripeEvents: { id text pk (Stripe event id), type text, processedAt timestamp }   // webhook idempotency
```

## 5. API Contract (all routes prefixed /api)

**Auth changes**
- `POST /auth/register` accepts optional `accountType: 'job_seeker' | 'employer'` (default `job_seeker` → role `rep`; `employer` → role `employer`; `ADMIN_EMAIL` always → `admin`)
- `GET /auth/me` also returns `company` for employers

**Public jobs**
- `GET /jobs?q&category&level&workplace&employmentType&minOte&location&page` → `{ sponsored: JobCard[], results: JobCard[], total, page, pageSize: 20 }`
  - Only `published` jobs with `expiresAt > now`.
  - `sponsored`: up to 3 jobs matching the same filters whose promotion is active, whose company balance ≥ CPC, and whose today's spend + CPC ≤ daily budget. Ordered by CPC desc, then promotion age. Each carries a signed `clickToken` (HMAC; valid 30 min). Serving them increments `impressions`.
  - `results`: organic matches, relevance (when `q`) then `publishedAt` desc, **excluding** jobs shown in `sponsored`.
- `GET /jobs/:slug` → job + company (name, slug, website, plan badge). Logs `job_view`. 404 if not published or expired.
- `POST /jobs/:slug/click` `{clickToken}` → records a sponsored click and charges per §6.1. Always returns `204`, so the result doesn't reveal billing state.

**Job seeker** (authenticated, verified email, role `rep`)
- `POST /applications/resume-upload-url` `{contentType: 'application/pdf', sizeBytes ≤ 5MB}` → `{uploadUrl, resumeKey}`
- `POST /jobs/:slug/apply` `{fullName, phone?, linkedinUrl?, resumeKey?, coverNote?}` → 201. 409 if already applied. 422 if the job is `external` or not open. `resumeKey` must start with `resumes/<own userId>/`. Rate limit 20 applications/hour/user.
- `GET /applications` → own applications with job + company + status

**Employer** (authenticated, verified email, role `employer`; every query scoped to the caller's company)
- `GET /employer/company`, `POST /employer/company` (one per user; 409 if exists), `PUT /employer/company`
- `GET /employer/jobs` → jobs with `{views, applications, impressions, clicks, spendCents}` totals
- `POST /employer/jobs` (creates draft), `GET /employer/jobs/:id`, `PUT /employer/jobs/:id`
- `POST /employer/jobs/:id/publish` → 422 with `reasons` if incomplete (§6). **402** if the plan's active-job limit is reached. Publishing a closed or expired job renews it for 30 days.
- `POST /employer/jobs/:id/close`
- `GET /employer/jobs/:id/applications`, `PUT /employer/applications/:id` `{status}`, `GET /employer/applications/:id/resume` → 15-minute signed URL
- `PUT /employer/jobs/:id/promotion` `{status, dailyBudgetCents, cpcCents}` (upsert; job must be published to activate), `GET /employer/jobs/:id/promotion` → promotion + last 30 days of stats

**Billing** (employer)
- `GET /billing` → `{plan, premiumCurrentPeriodEnd, creditBalanceCents, launchPromoActive, ledger: last 50}`
- `POST /billing/credits/checkout` `{amountCents ∈ {5000, 10000, 25000, 50000}}` → `{url}` (Stripe Checkout, mode=payment)
- `POST /billing/premium/checkout` → `{url}` (mode=subscription, `STRIPE_PREMIUM_PRICE_ID`, `STRIPE_LAUNCH_COUPON_ID` applied while the launch promo is active). 409 if already premium.
- `POST /billing/portal` → `{url}` (Stripe Billing Portal, for canceling or updating the card)
- `POST /billing/webhook` (raw body, Stripe signature verified; no session):
  - `checkout.session.completed` with `metadata.kind='credits'` → ledger `topup` + balance increment (idempotent on session id)
  - `checkout.session.completed` with `mode=subscription` → store customer and subscription ids
  - `customer.subscription.created|updated|deleted` → set `plan` (`premium` while status is `active` or `trialing`) and `premiumCurrentPeriodEnd`
  - Every event id is recorded in `stripeEvents`; duplicates are acknowledged and ignored.
- **Dev fallback** (non-production and placeholder `STRIPE_SECRET_KEY` only): the checkout endpoints fulfill immediately through the same code path the webhook uses, log `[dev-billing]`, and return `{url: APP_URL/employer/billing?dev=1}`.

**Rules**
- Every input validated with shared Zod schemas; 400 with field errors.
- Role gating: seeker routes 403 for employers; employer and billing routes 403 for reps. Phase 1 profile/records/proofs routes are 403 for employers.

## 6. Business Rules

**Publish requirements (422 reasons):** title, category, level, employmentType, workplace, location, description ≥ 100 chars, compType, and pay:
- `salary_only` → `baseMin` + `baseMax`
- `commission_only` → `oteMin` + `oteMax`
- `base_plus_commission` → both ranges, with `oteMin ≥ baseMin`
- Every range must have min ≤ max. `external` jobs need an https `applyUrl`.
- Pay ranges are **required**. Pay transparency is the product's main draw for sales seekers, and several US states require it.

**Plans (`services/plans.ts`, constants, not DB):**

| | Free | Premium |
|---|---|---|
| Active (published, unexpired) jobs | 1 | 25 |
| "Premium employer" badge on listings and job page | — | ✓ |
| Sponsored jobs (pay per click from credits) | ✓ | ✓ |

**Launch promo:** while `now < LAUNCH_PROMO_ENDS_AT` and a coupon id is configured, Premium checkout applies the 3-month coupon. The billing page shows the launch price messaging.

### 6.1 Sponsored-Click Charging (all in one DB transaction)

1. Verify `clickToken` HMAC and age ≤ 30 min, and that its job matches `:slug`. If invalid, return 204 with no charge.
2. `viewerHash` = HMAC of the user id if logged in, else IP + user-agent.
3. Lock the company row (`SELECT … FOR UPDATE`).
4. Not billable, recorded with `chargedCents = 0`, if any of these is true:
   - the viewer is a member of the job's company
   - the promotion is paused
   - the job is closed or expired
   - today's `spendCents + cpc > dailyBudgetCents`
   - `creditBalanceCents < cpc`
5. `INSERT promotionClicks … ON CONFLICT (promotionId, day, viewerHash) DO NOTHING`. If there's a conflict, it's a duplicate: no charge, no count.
6. If billable: ledger `click` entry of −cpc, balance −= cpc, and daily stats `clicks+1, chargedClicks+1, spendCents+=cpc`. If not billable: daily stats `clicks+1` only.

The balance can never go negative, and spend can never exceed the daily budget. Both are tested.

## 7. Pages (client)

1. `/` Landing: "Sales jobs from SDR to CRO", search box, "Post a job" CTA for employers
2. `/jobs`: search + filters (category, level, workplace, min OTE); sponsored cards labeled **Sponsored**; pagination
3. `/jobs/:slug`: job detail with pay, level, workplace and company; Apply (platform form with PDF resume upload) or "Apply on company site"
4. `/signup` (Job seeker / Employer toggle), `/login`, `/verify`
5. `/dashboard/applications`: the seeker's application statuses
6. `/employer`: company setup if missing; jobs table with status and stats; credit balance and plan
7. `/employer/jobs/new`, `/employer/jobs/:id/edit`: job form with publish-blocker messages
8. `/employer/jobs/:id`: applicants (status dropdown, resume link) + Promote panel (daily budget, CPC, pause) + 30-day stats
9. `/employer/billing`: plan card with launch-promo messaging, add-credit buttons, credit history

Design direction: unchanged from Phase 1 (clean, data-forward, neutral background, accent #2563EB). Sponsored labels must be visible, never disguised.

## 8. Milestones with Acceptance Criteria

Implement in order. (Phase 1 used M1–M6.)

**M7 — Employer accounts + companies + auth UI**
- [ ] Register with `accountType=employer` creates role `employer`; the default stays `rep`
- [ ] Company create/read/update; a second create returns 409; slug deduped
- [ ] Employers get 403 on `/profile`, `/records`, `/proofs`; reps get 403 on `/employer/*`
- [ ] `/signup`, `/login`, `/verify` pages work end to end (not placeholders)

**M8 — Job posts + public board**
- [ ] Employer creates a draft; publish returns 422 with reasons for each rule in §6
- [ ] Free plan: publishing a 2nd active job returns 402; closing the first frees the slot
- [ ] `GET /jobs` returns only published, unexpired jobs; filters and `q` search work; 20 per page
- [ ] `GET /jobs/:slug` 404s for drafts, closed and expired jobs; logs `job_view`
- [ ] A company can never read or edit another company's job (test)
- [ ] `/jobs`, `/jobs/:slug`, and the employer job form/list pages work

**M9 — Applications**
- [ ] Seeker applies once (409 on repeat); an external-apply job returns 422; employers get 403 on apply
- [ ] Resume upload URL rejects non-PDF and >5MB; `resumeKey` under another user's prefix is rejected
- [ ] Employer lists applicants for own jobs only; status update works; resume served as a signed URL only to the owning company
- [ ] Seeker sees their applications with status; applicant's published profile is linked
- [ ] Apply form + `/dashboard/applications` + employer applicants list pages work

**M10 — Sponsored jobs**
- [ ] Promotion upsert validates the budget and CPC bounds; activation requires a published job
- [ ] Sponsored slot shows only eligible promotions (active, funded, under budget, matching filters), max 3, highest CPC first, labeled
- [ ] Impressions counted; a click charges the CPC once per viewer per day; the company's own clicks are free
- [ ] Charging stops exactly at the daily budget and never takes the balance below 0 (tests)
- [ ] Forged or expired click tokens charge nothing (test)
- [ ] Promote panel + stats on `/employer/jobs/:id`

**M11 — Stripe billing**
- [ ] Credit checkout creates a Stripe Checkout Session with the chosen amount and company metadata (Stripe mocked in tests)
- [ ] Webhook rejects a bad signature (400); a signed `checkout.session.completed` adds credits exactly once even if delivered twice
- [ ] Subscription webhooks flip the plan to premium and back to free on deletion; the premium limit (25) applies
- [ ] Premium checkout applies the launch coupon only while the promo is active (test both sides of the date)
- [ ] Dev fallback works with placeholder keys; production boot fails with placeholder Stripe keys
- [ ] `/employer/billing` page works

**M12 — Polish + seed**
- [ ] `scripts/seed.ts` also creates 3 companies (1 premium, with credits and an active promotion) and 15 jobs spanning all levels, from entry to executive
- [ ] All new pages usable at 375px width
- [ ] Employer dashboard stats match the DB (test)

## 9. Non-Goals for this phase (do NOT build)

- No resume parsing, AI matching, or job recommendations
- No messaging or chat between employers and seekers (email via application details only)
- No job alerts or saved searches, no saved jobs
- No team members or recruiter seats (one owner per company)
- No company reviews or ratings
- No job scraping, importing or aggregation from other boards
- No pay-per-application pricing, no auction second-price logic, no budget pacing
- No metrics engine, Salesforce/HubSpot imports, or public rep dollar figures (see `docs/PARKED-metrics-engine.md`)
- No OAuth login, no 2FA, no SSR, no Docker, no CI, no dark mode

## 10. Security Requirements (blocking, not optional)

Everything in Phase 1 §10 still applies (bcrypt 12, secure session cookies, no `dangerouslySetInnerHTML`, Drizzle-only SQL, helmet, CORS locked to APP_URL, originals and resumes never public). Plus:
- Stripe webhooks verified with `STRIPE_WEBHOOK_SECRET` against the **raw** body; unsigned or invalid → 400
- Credits change **only** via the webhook or dev-fallback fulfillment path, or click charges. No client-supplied amounts are ever credited.
- Every employer query filters by the caller's `companyId` in SQL
- Resumes are only reachable through 15-minute signed URLs issued to the owning company or the applicant
- Click tokens HMAC-signed with `SESSION_SECRET`; viewer identity stored only as an HMAC, never as a raw IP
- Job descriptions rendered as plain text (`whitespace-pre-wrap`), never as HTML
- External apply URLs and company websites must be `https://`
