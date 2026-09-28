# BUILD SPEC v2 — Sales Job Board, Phase 2 (Two-Sided Marketplace + Metrics Engine)
*Status: **PARKED** (2026-09-24). Owner chose to build the employer-paid job board first (see `SPEC.md`). Revisit after the job board ships. Owner answers so far: public must NOT see rep dollar figures (premium feature later); Salesforce before HubSpot when imports resume; metrics focus on SDR-level roles first.*

*Background research: `docs/market-research.md`.*

---

## 0. Summary

Phase 1 built the rep side: profiles, performance records, proof uploads, and admin review. Phase 2 adds:

1. **Metrics engine.** Reps post structured numbers (quota attainment, revenue, conversion rates, meetings, win rate, NRR, and more) tied to a role at a company, at monthly, quarterly, or yearly granularity. The numbers roll up correctly to **any date range**.
2. **Data import.** CSV first, which covers Tableau and Salesforce report exports and Excel trackers. Then direct Salesforce and HubSpot OAuth, storing aggregates only.
3. **A verification ladder per metric.** Each metric shows its source: self-reported → document proof → manager attested → system-sourced.
4. **Employer side.** Company accounts, sales-specific job posts with required pay transparency, applications, and candidate search on verified metrics.
5. **Two-way matching.** Reps apply to jobs; employers send intro requests to anonymous candidates. The rep's identity is revealed only on accept, and reps can block their current employer.

## 1. Technology

All Phase 1 choices in `SPEC.md` §1 stay locked. Additions:

| Need | Choice | Why |
|---|---|---|
| Search | PostgreSQL full-text search (`tsvector`) + B-tree/GIN indexes | No new infrastructure until there are more than ~100k rows |
| CSV parsing | `papaparse` (server side, streaming) | Mature, handles messy exports |
| OAuth token storage | AES-256-GCM via `node:crypto`, key in env | Tokens are never stored in plaintext |
| Charts (client) | `recharts` | Metric trend lines on profiles |
| Salesforce / HubSpot | Plain `fetch` against their REST APIs | No heavy SDKs |

New env vars: `TOKEN_ENCRYPTION_KEY`, `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`. The OAuth vars are required only when their milestone ships.

## 2. Core design decision: how metrics are stored

**Problem:** reps want to show numbers over *any* period, but you can't average percentages. If a rep hit 80% of a $100k quota in Q1 and 150% of a $400k quota in Q2, H1 attainment is (80k+600k)/(500k) = **136%**, not the average of the two, which is 115%.

**Rule:** every metric is stored as a **numerator + optional denominator** at the finest granularity the rep supplies. Any period is computed on read as `sum(numerator) / sum(denominator)`.

| Metric kind | numerator | denominator | Rollup |
|---|---|---|---|
| `sum` (revenue, meetings, new logos) | the value | null | `sum(num)` |
| `ratio` (attainment, win rate, conversion, NRR) | achieved amount / wins / converted | quota / opportunities / entered | `sum(num)/sum(den)` |
| `average` (sales cycle days, deal size) | total (days, $) | count | `sum(num)/sum(den)` |
| `snapshot` (stack rank, team size) | value | null | not rolled up; shown per period only |

Some reps won't share the underlying figures (for example, their quota in dollars). A rep can instead enter a **display-only percentage** (`displayValue`). It's shown for its exact period but **excluded from rollups**. The UI says "can't combine: add the underlying numbers to include in totals."

**Partial coverage:** when a requested range only partly overlaps the stored periods, the API returns the rollup over fully contained periods plus `coverage: {requestedDays, coveredDays}`. It never silently extrapolates.

## 3. Metric catalog (shared code, `shared/metrics.ts`, not a DB table)

Each metric has a key, label, kind, unit, allowed range, and the role types it's suggested for:

- **Every role:** `quota_attainment` (ratio, %, 0–500), `stack_rank` (snapshot, with `teamSize`), `promotions`/`awards` (count)
- **SDR/BDR:** `meetings_booked`, `meetings_held`, `meeting_held_rate` (ratio), `opportunities_sourced`, `pipeline_sourced_usd`, `sourced_closed_won_usd`, `lead_to_meeting_rate` (ratio)
- **AE / Field / Inside:** `closed_won_usd`, `new_logos`, `win_rate` (ratio), `avg_deal_size_usd` (average), `sales_cycle_days` (average), `self_sourced_pipeline_usd`, `opp_to_close_rate` (ratio)
- **AM / CSM:** `net_revenue_retention` (ratio), `gross_revenue_retention` (ratio), `expansion_usd`, `renewal_rate` (ratio)
- **Manager:** `team_attainment` (ratio), `pct_reps_at_quota` (ratio), `team_size` (snapshot), `rep_retention_rate` (ratio), `reps_promoted` (count)

Values outside a metric's plausibility range (for example attainment > 300%) are accepted but flagged `needsProof`. They can't show above the "document proof" level until an admin approves a linked proof.

## 4. Database additions (Drizzle)

```ts
// users.role enum gains 'employer'  → enum('rep','employer','admin')

positions: {                             // work history; metrics hang off a position
  id uuid pk
  profileId fk -> repProfiles cascade
  companyName text not null
  companyDomain text null                // used for blocking + manager attestation
  hideCompanyName boolean default false  // public shows "Series B Cybersecurity SaaS" instead
  companyDescriptor varchar(80) null
  title text not null
  roleType roleTypeEnum not null
  segment enum('smb','mid_market','enterprise','strategic','mixed') null
  dealType enum('new_business','expansion','renewal','mixed') null
  avgDealSizeBand enum('<10k','10-50k','50-150k','150-500k','500k+') null
  startDate date not null
  endDate date null                      // null = current
  createdAt / updatedAt
}

metricEntries: {
  id uuid pk
  positionId fk -> positions cascade
  metricKey text not null                // validated against shared/metrics.ts
  periodStart date not null
  periodEnd date not null                // inclusive; must lie within the position's dates
  numerator numeric(16,2) null
  denominator numeric(16,2) null
  displayValue numeric(10,2) null        // display-only %, excluded from rollups
  source enum('manual','csv','salesforce','hubspot') not null
  importBatchId fk -> importBatches null
  verificationLevel enum('self_reported','document','manager_attested','system') default 'self_reported'
  proofItemId fk -> proofItems null
  needsProof boolean default false
  createdAt / updatedAt
  UNIQUE(positionId, metricKey, periodStart, periodEnd)
}

importBatches: {
  id uuid pk
  profileId fk cascade
  source enum('csv','salesforce','hubspot')
  status enum('previewed','committed','reverted')
  rowCount int, errorCount int
  fileKey text null                      // R2 key of the uploaded CSV (private, deleted after 30 days)
  attestedAt timestamp not null          // rep confirmed they're allowed to share this data
  createdAt
}

integrationConnections: {
  id uuid pk
  userId fk cascade
  provider enum('salesforce','hubspot')
  externalUserId text, instanceUrl text
  accessTokenEnc text, refreshTokenEnc text   // AES-256-GCM
  scopes text[], connectedAt, lastSyncedAt, revokedAt
}

managerAttestations: {
  id uuid pk
  positionId fk cascade
  managerName text, managerEmail text     // email domain must match positions.companyDomain
  tokenHash text, expiresAt timestamp
  status enum('pending','confirmed','disputed','expired')
  managerComment varchar(500) null
  respondedAt timestamp null
}

companies: {
  id uuid pk
  name text, slug text unique, domain text unique
  domainVerifiedAt timestamp null         // employer's verified email is on this domain
  logoKey text null, sizeBand enum, hqLocation text, description text
  createdAt
}

companyMembers: { companyId fk, userId fk, role enum('owner','recruiter'), PK(companyId,userId) }

jobPosts: {
  id uuid pk
  companyId fk cascade
  createdByUserId fk
  title text, slug text unique
  roleType roleTypeEnum, segment enum, dealType enum
  industries text[]
  location text, workplace enum('remote','hybrid','onsite')
  baseMin int not null, baseMax int not null         // pay transparency is REQUIRED
  oteMin int not null, oteMax int not null
  quotaAnnual int null, rampMonths int null
  avgDealSizeBand enum null, salesCycleBand enum null
  pctRepsAtQuotaLastYear int null                    // employer-stated, labeled as such
  description text                                   // max 8000
  requirements jsonb                                 // [{metricKey, min, verifiedOnly}] soft filters
  status enum('draft','published','closed'), publishedAt, expiresAt   // auto-close after 60 days
  createdAt / updatedAt
}

applications: {
  id uuid pk
  jobPostId fk cascade, profileId fk cascade
  status enum('applied','viewed','shortlisted','interviewing','offer','hired','rejected','withdrawn')
  note varchar(1000) null
  createdAt, updatedAt
  UNIQUE(jobPostId, profileId)
}

introRequests: {                          // employer → rep (reverse marketplace)
  id uuid pk
  companyId fk, senderUserId fk, profileId fk, jobPostId fk null
  message varchar(1000)
  status enum('pending','accepted','declined','expired')   // expires after 14 days
  createdAt, respondedAt
}

repPreferences: {                         // 1:1 with repProfiles
  profileId pk fk cascade
  openToWork enum('not_looking','open','actively_looking')
  searchVisibility enum('hidden','anonymous','public') default 'anonymous'
  blockedDomains text[]                   // current employer etc.; hidden from those companies' members
  desiredRoleTypes roleTypeEnum[], desiredSegments text[], minOte int null
}

savedJobs: { profileId fk, jobPostId fk, PK(profileId, jobPostId), createdAt }

events.type enum gains: 'job_view','job_apply','intro_sent','intro_accepted','search_impression','import_committed'
```

**Migration:** existing `performanceRecords` rows are migrated into a synthetic position ("Imported history") plus `quota_attainment` entries with `displayValue` set. Their free-text `periodLabel` is parsed into dates where possible ("Q3 2025" → 2025-07-01..2025-09-30); rows that can't be parsed stay in `performanceRecords` and are shown until the rep fixes them. `performanceRecords` is then deprecated (read-only) and dropped one milestone later.

**Tier logic (§7 of SPEC.md) becomes:** `verified` = at least one metric entry at `document`, `manager_attested`, or `system` level, or any approved proof (backward compatible).

## 5. API additions (all `/api`)

Rep (authenticated, verified email, role=rep):
- `GET/POST/PUT/DELETE /positions[/:id]`
- `GET/POST/PUT/DELETE /metrics[/:id]`, plus `POST /metrics/bulk` (up to 500 rows, one transaction)
- `GET /metrics/rollup?from=YYYY-MM-DD&to=YYYY-MM-DD&metricKeys=a,b&positionId=` → `{metricKey, value, numerator, denominator, coverage, verificationLevelMin}`
- `GET /imports/template.csv?roleType=ae` → CSV template with headers for that role's metrics
- `POST /imports/csv` (multipart, ≤2MB, ≤5,000 rows) → `{batchId, preview[], errors[{row, field, message}]}`. Nothing is written to `metricEntries` yet.
- `POST /imports/:batchId/commit` {attest: true} → writes the entries; `POST /imports/:batchId/revert` deletes them
- `GET /integrations/:provider/connect` → OAuth redirect; `GET /integrations/:provider/callback`; `POST /integrations/:provider/sync` {from, to}; `DELETE /integrations/:provider`
- `POST /positions/:id/attestations` {managerName, managerEmail} → emails the manager a signed link
- `GET/PUT /preferences`
- `GET /applications` (mine), `POST /jobs/:id/apply`, `POST /applications/:id/withdraw`
- `GET /intros` (received), `POST /intros/:id/accept|decline`
- `POST/DELETE /saved-jobs/:jobId`

Manager (no login):
- `GET /attest/:token` → the position and metrics being attested; `POST /attest/:token` {decision: confirm|dispute, comment}

Employer (authenticated, verified email, role=employer, member of a company):
- `POST /companies` (creates the company; domain auto-verified if the email domain matches and isn't a free-mail provider), `PUT /companies/:id`
- `GET/POST/PUT /employer/jobs[/:id]`, `POST /employer/jobs/:id/publish|close`
- `GET /employer/jobs/:id/applications`, `PUT /employer/applications/:id` {status}
- `GET /employer/candidates?roleType&segment&minAttainment&minVerification&location&remote&maxOte&q&page` → **anonymized** cards (no name, no company names, no photo, no slug). Excludes `hidden` profiles and any profile whose `blockedDomains` includes the employer's company domain.
- `POST /employer/intros` {profileId, jobPostId?, message}. Rate limit: 20/day per company.

Public:
- `GET /jobs?q&roleType&segment&workplace&oteMin&location&page`, `GET /jobs/:slug`, `GET /companies/:slug`
- `GET /r/:slug` now also returns positions (respecting `hideCompanyName`), a metrics time series, and a verification level per metric

## 6. Import specifics

**CSV (M9)**
- Template columns: `company, title, role_type, segment, period_start, period_end, metric_key, numerator, denominator, display_value`
- Also accepts a "wide" layout (one row per period, one column per metric) and detects it from the headers
- Row-level validation errors come back with line numbers, and **nothing commits unless the whole batch validates** (or the rep chooses "commit valid rows only")
- Re-importing the same (position, metric, period) → upsert, with a preview that shows what changes

**Salesforce (M15)**
- OAuth 2.0 web server flow, scopes `api refresh_token`
- Queries `Opportunity WHERE OwnerId = :me AND IsClosed = true AND CloseDate in range`, aggregated server-side **in memory** into monthly `closed_won_usd`, `new_logos`, `win_rate`, `avg_deal_size_usd`, `sales_cycle_days`
- **Stores only the monthly aggregates.** Opportunity names, account names, and IDs are never persisted.
- Quota isn't a standard Salesforce object. The rep enters the quota denominator, or it's pulled from `ForecastingQuota` when that's available.
- Resulting entries get `source='salesforce'`, `verificationLevel='system'`. If the rep edits one, it drops to `self_reported`.

**HubSpot (M16):** same pattern using the Deals API filtered by `hubspot_owner_id`.

## 7. Pages (client)

Rep: `/dashboard/experience` (positions + metrics grid), `/dashboard/import` (upload → preview table → attest → commit), `/dashboard/integrations`, `/dashboard/jobs` (saved + applications tracker), `/dashboard/intros`, `/dashboard/privacy` (visibility, blocked companies)
Public: `/jobs`, `/jobs/:slug`, `/companies/:slug`, and an upgraded `/r/:slug` with a period picker (Last 4Q / FY / custom), a trend chart per metric, and a verification badge on each metric
Employer: `/employer/onboarding`, `/employer/jobs`, `/employer/jobs/new`, `/employer/jobs/:id/pipeline` (kanban by status), `/employer/candidates` (filters + anonymized cards), `/employer/intros`
Manager: `/attest/:token`

## 8. Milestones

Each milestone keeps the Phase 1 rule: acceptance criteria pass before the next one starts.

**M7 — Finish Phase 1 client + password reset** *(prerequisite; Phase 1 UI is currently mostly placeholders)*
- [ ] Signup, login, verify, dashboard (completeness meter, publish toggle), proofs (drag-drop, status badges), and admin queue pages are real, not placeholders
- [ ] Password reset via emailed token (1h expiry, single use)
- [ ] 375px responsive; Lighthouse a11y ≥ 90 on `/r/:slug`

**M8 — Positions + metrics engine**
- [ ] Positions CRUD; metrics CRUD validated against the catalog; each metric period must fall within its position's dates
- [ ] Rollup returns the correct weighted ratio (unit test: the 80%/$100k + 150%/$400k case = 136%)
- [ ] `displayValue`-only entries are excluded from rollups and flagged in the response
- [ ] Coverage reported for partial ranges
- [ ] Phase 1 `performanceRecords` migrated; public page renders the new model

**M9 — CSV import**
- [ ] Template download per role type
- [ ] Long and wide layouts both parse; per-row errors include line numbers
- [ ] Preview writes nothing; commit requires `attest: true`; revert removes exactly that batch's rows
- [ ] Rejects >2MB, >5,000 rows, and non-CSV MIME

**M10 — Employer accounts + companies**
- [ ] Employer signup path; free-mail domains (gmail etc.) can create a company but it shows "unverified company"
- [ ] Company page; owner can invite recruiters by email
- [ ] Reps cannot hit `/employer/*` (403) and employers cannot hit rep routes (403)

**M11 — Job posts + public job board**
- [ ] Publish blocked (422) without base range, OTE range, roleType, location/workplace
- [ ] `/jobs` search + filters work on Postgres FTS; unpublished and expired posts are never listed
- [ ] Posts auto-close at `expiresAt`

**M12 — Applications**
- [ ] Rep applies with profile (one per job), withdraws; employer moves status; rep sees status changes
- [ ] Employer sees the full profile only for applicants (applying = consent to reveal)
- [ ] Rep is emailed on status changes to `interviewing`, `offer`, `rejected`

**M13 — Candidate search + intro requests + privacy**
- [ ] Search filters on metric thresholds use rollups over the last 4 complete quarters
- [ ] Cards are anonymized; a test asserts no name, slug, email, or company name in the payload
- [ ] Blocked-domain reps never appear to that company (test)
- [ ] Accepting an intro reveals profile + email to that company only; declines are silent to the employer after 14 days

**M14 — Manager attestation**
- [ ] Manager email domain must match the position's company domain; free-mail rejected
- [ ] Confirm raises that position's metrics to `manager_attested`; dispute flags them for admin
- [ ] Token single-use, 14-day expiry

**M15 — Salesforce import** *(needs a Salesforce Developer Edition org for testing)*
- [ ] OAuth connect/disconnect; tokens encrypted at rest (test: DB column is not plaintext)
- [ ] Sync produces monthly aggregates; test asserts no Opportunity/Account names are persisted
- [ ] Edited system-sourced entries drop to `self_reported`

**M16 — HubSpot import:** same criteria as M15.

## 9. Non-Goals for Phase 2

- No payments or billing *(pending §12 Q2)*
- No in-app chat. An accepted intro exchanges emails; chat comes later.
- No AI matching or ranking. Filters and sorting only.
- No ATS integrations (Greenhouse, Lever), no resume parsing
- No Tableau API connector (CSV covers it), no Gong/Outreach connectors
- No mobile apps, no SSR, no Docker/CI, no dark mode (unchanged from Phase 1)
- No scraping or aggregating jobs from other boards

## 10. Security (blocking)

Everything in `SPEC.md` §10, plus:
- OAuth tokens AES-256-GCM encrypted; key never logged; revoke on disconnect
- Imported CRM data: aggregates only; raw API responses are never written to disk, DB, or logs
- Anonymized candidate payloads built by an allowlist serializer, never by stripping fields from a full object
- Employer company scoping enforced in every query (a recruiter can never read another company's applications). Tests are required.
- Blocked-domain filtering happens in SQL, not after fetch
- Attestation and intro tokens stored hashed (like verification tokens)

## 11. Metrics to watch (instrument from M10)

Marketplace health: **published verified profiles**, **live job posts**, apply rate per job view, intro accept rate, time to first application per job, and the ratio of reps with at least one system/manager-verified metric. If intro accept rate is < 20%, the employer targeting or the rep's privacy settings are wrong.

## 12. Open questions for the owner

1. **Who's the first customer:** employers hiring reps, or reps building a portable track record? This decides whether M10–M13 or M8–M9 + M14 come first.
2. **Monetization at launch:** free everything (grow both sides), free posts + paid candidate search/intros (Wellfound model), or a placement fee? Payments stay out until this is answered.
3. **Metric privacy default:** should dollar figures (quota, revenue) be public, employer-only, or hidden with only percentages shown?
4. **Import priority after CSV:** Salesforce or HubSpot first? (It depends on whether your audience is enterprise or SMB/startup sellers.)
5. **Scope of "every level":** does this include sales leadership (VP/CRO) roles, which need different metrics (org attainment, hiring, forecast accuracy)?
6. **Geography/currency:** US-only and USD for Phase 2?
