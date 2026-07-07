# BUILD SPEC — Sales Rep Job Board, Phase 1 (Rep Side MVP)
*This document is written for an AI coding agent. All decisions are final. Do not substitute technologies, add features beyond the milestone scope, or skip acceptance criteria.*

---

## 0. Project Summary

A job platform where sales reps create profiles backed by verified performance proof (screenshots of leaderboards, quota attainment, awards). Phase 1 builds ONLY the rep/supply side plus an admin review system. There is no employer side, no payments, no messaging in this phase.

---

## 1. Locked Technology Decisions

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | SPA |
| Styling | Tailwind CSS | No component library; custom components |
| Routing | React Router v6 | |
| Server | Node 20 + Express + TypeScript | |
| ORM | Drizzle ORM | Schema in `shared/schema.ts` |
| Database | PostgreSQL 15+ | |
| Auth | express-session + connect-pg-simple + bcrypt | Email/password only in Phase 1. NO OAuth yet. |
| File storage | Cloudflare R2 via `@aws-sdk/client-s3` | Never store binary data in Postgres |
| Image processing | `sharp` | EXIF strip + thumbnail generation on upload |
| Email | Resend | Verification + notification emails |
| Validation | Zod | Shared schemas between client and server |
| Testing | Vitest + Supertest | API route tests required per milestone |

## 2. Repository Structure

```
/client            # Vite React app
  /src
    /components
    /pages
    /lib           # api client, hooks
/server
  /routes          # one file per resource
  /middleware      # auth, rateLimit, upload
  /services       # r2.ts, email.ts, imageProcessing.ts
  index.ts
/shared
  schema.ts        # Drizzle schema — single source of truth
  validators.ts    # Zod schemas
/scripts
  seed.ts
```

## 3. Environment Variables (fail fast at boot if missing)

```
DATABASE_URL
SESSION_SECRET
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
RESEND_API_KEY
APP_URL
ADMIN_EMAIL          # first admin account bootstrap
```

## 4. Database Schema (Drizzle — implement exactly)

```ts
users: {
  id: uuid pk default random
  email: text unique not null
  passwordHash: text not null
  role: enum('rep','admin') not null default 'rep'
  emailVerifiedAt: timestamp null
  createdAt: timestamp default now
}

repProfiles: {
  id: uuid pk
  userId: uuid fk -> users.id, unique, cascade delete
  slug: text unique not null            // for public URL /r/:slug
  displayName: text not null
  headline: varchar(120)
  bio: text                              // max 2000 chars, enforced in Zod
  roleType: enum('sdr','ae','am','field','inside','manager','other')
  industries: text[]                     // max 5
  yearsExperience: integer
  oteMin: integer null                   // whole dollars
  oteMax: integer null
  location: text
  remoteOk: boolean default false
  isPublished: boolean default false     // rep controls visibility
  verificationTier: enum('unverified','self_reported','verified')
      default 'unverified'               // computed, see §7
  createdAt / updatedAt: timestamps
}

performanceRecords: {
  id: uuid pk
  profileId: uuid fk -> repProfiles.id cascade
  periodLabel: text not null             // e.g. "Q3 2025"
  quotaAttainmentPct: integer null       // 0–500, Zod enforced
  rank: integer null
  teamSize: integer null
  notes: varchar(280) null
  createdAt: timestamp
}

proofItems: {
  id: uuid pk
  profileId: uuid fk cascade
  performanceRecordId: uuid fk null      // optional link to a record
  originalKey: text not null             // R2 object key — NEVER served publicly
  redactedKey: text null                 // admin-uploaded redacted version
  thumbKey: text null
  type: enum('leaderboard','commission','award','other')
  status: enum('pending','approved','rejected') default 'pending'
  rejectionReason: text null
  reviewedByUserId: uuid fk -> users.id null
  reviewedAt: timestamp null
  createdAt: timestamp
}

events: {                                // analytics from day one (feeds ads mgr later)
  id: uuid pk
  actorUserId: uuid null
  type: enum('profile_view','proof_view','signup','publish')
  targetId: uuid null
  createdAt: timestamp
}
```

## 5. API Contract (all routes prefixed /api)

Auth:
- `POST /auth/register` {email, password} → 201, sends verification email
- `POST /auth/verify` {token} → marks emailVerifiedAt
- `POST /auth/login` {email, password} → session cookie
- `POST /auth/logout`
- `GET  /auth/me` → current user + profile or 401

Profile (rep, authenticated + email verified):
- `GET  /profile` → own profile with records + proofs
- `PUT  /profile` → upsert profile fields (Zod validated)
- `POST /profile/publish` → sets isPublished true; requires displayName, headline, roleType, location
- `POST /records` / `PUT /records/:id` / `DELETE /records/:id`
- `POST /proofs/upload-url` {type, contentType, sizeBytes} → presigned R2 PUT URL + proofItem row (status pending). Reject non-image/PDF MIME, reject > 10MB.
- `POST /proofs/:id/complete` → server downloads object, strips EXIF via sharp, generates 400px thumb, re-uploads, marks ready for review
- `DELETE /proofs/:id`

Public:
- `GET /r/:slug` → published profile: fields, performance records, APPROVED proofs only (served via redactedKey if present, else originalKey — but ONLY if admin approved), verification badge. Logs `profile_view` event.

Admin (role=admin):
- `GET  /admin/proofs?status=pending` → review queue with signed URLs to originals
- `POST /admin/proofs/:id/approve` (optional multipart redacted image upload)
- `POST /admin/proofs/:id/reject` {reason} → emails rep via Resend
- `GET  /admin/stats` → counts: users, published profiles, pending proofs

Rules:
- All image serving uses 15-minute signed R2 URLs generated per request. No public bucket access.
- Rate limit: 10 uploads/hour/user, 5 auth attempts/15min/IP (`express-rate-limit`).
- Every route input validated with shared Zod schemas; 400 with field errors on failure.

## 6. Pages (client)

1. `/` Landing — headline, value prop, signup CTA
2. `/signup`, `/login`, `/verify`
3. `/dashboard` — profile completeness meter, proof statuses, publish toggle
4. `/dashboard/edit` — profile form
5. `/dashboard/proofs` — upload (drag-drop), list with status badges (pending/approved/rejected + reason)
6. `/r/:slug` — public profile: header (name, headline, badge tier), performance table, approved proof gallery (lightbox), OTE range, location
7. `/admin` — review queue: image viewer, approve / reject-with-reason, upload-redacted-version

Design direction: clean, high-trust, data-forward. Neutral background, one accent color (#2563EB), verification badges as the visual hero. No stock photos.

## 7. Verification Tier Logic (server-computed on relevant writes)

- `unverified`: default
- `self_reported`: ≥1 performanceRecord with quotaAttainmentPct set
- `verified`: ≥1 proofItem with status=approved
Recompute on: record create/delete, proof approve/reject.

## 8. Milestones with Acceptance Criteria

Implement in order. Do not begin a milestone until the previous one's criteria pass.

**M1 — Scaffold + Auth**
- [ ] `npm run dev` boots client+server; boot fails loudly listing missing env vars
- [ ] Register → verification email sends (log link in dev) → verify → login → `GET /auth/me` returns user
- [ ] Unverified email cannot access /profile routes (403)
- [ ] Supertest coverage: register/login/verify happy path + wrong password + duplicate email

**M2 — Profile CRUD**
- [ ] Rep can create/edit profile; slug auto-generated from displayName, deduped with suffix
- [ ] Publish blocked (422 with reasons) until required fields present
- [ ] Public page 404s for unpublished profiles
- [ ] Zod rejects: bio >2000 chars, >5 industries, oteMin > oteMax

**M3 — Performance Records + Tier Logic**
- [ ] CRUD works; attainment outside 0–500 rejected
- [ ] Adding first record with attainment flips tier to self_reported; deleting it reverts
- [ ] Public page renders records table sorted by createdAt desc

**M4 — Proof Upload Pipeline**
- [ ] Presigned upload works; non-image/PDF and >10MB rejected
- [ ] Complete step strips EXIF (verify: uploaded image with GPS EXIF → stored copy has none) and creates thumbnail
- [ ] Proofs invisible on public page while pending
- [ ] Rate limit returns 429 on 11th upload in an hour

**M5 — Admin Review**
- [ ] Admin queue shows pending proofs oldest-first with signed original URLs
- [ ] Approve → proof appears on public page, tier flips to verified, rep emailed
- [ ] Reject with reason → rep emailed reason, proof hidden
- [ ] Admin can attach redacted version; public page serves redacted, never original
- [ ] Non-admin hitting /admin routes gets 403

**M6 — Polish + Seed**
- [ ] `scripts/seed.ts` creates admin + 10 realistic rep profiles across tiers
- [ ] Mobile responsive at 375px on all pages
- [ ] Profile completeness meter accurate
- [ ] Lighthouse accessibility ≥ 90 on public profile page

## 9. Non-Goals for Phase 1 (do NOT build)

- No employer accounts, job posts, search, messaging, payments
- No OAuth, no password reset (add M7 later), no 2FA
- No automated image moderation/OCR
- No feed, likes, follows, or notifications beyond the emails specified
- No SSR/Next.js migration, no Docker, no CI pipeline
- No dark mode

## 10. Security Requirements (blocking, not optional)

- bcrypt cost 12; sessions httpOnly, sameSite=lax, secure in prod
- Original proof uploads NEVER exposed publicly; only approved (and preferably redacted) versions on public pages, via short-lived signed URLs
- All user-rendered strings escaped (React default) — no `dangerouslySetInnerHTML`
- SQL only through Drizzle parameterized queries
- helmet() on Express; CORS locked to APP_URL

---

## How to Feed This to a Coding Agent

1. Create the repo, add this file as `SPEC.md`, and create a `CLAUDE.md` containing: "Read SPEC.md fully before any work. Implement one milestone at a time. Do not add anything listed in §9. After each milestone, run tests and list which acceptance criteria pass."
2. Prompt per milestone: *"Implement Milestone N from SPEC.md. Show me the acceptance criteria checklist with pass/fail before moving on."*
3. Review the acceptance checklist yourself before authorizing the next milestone — you are the QA gate.
