# 🏆 Sales Rep Job Board

A job platform where sales reps build profiles backed by **verified performance proof** — leaderboard screenshots, quota attainment, awards — instead of just claims on a resume.

## The problem

Hiring salespeople is broken in a specific way: every resume says "President's Club" and "150% of quota," and hiring managers have no way to tell the real performers from the storytellers. Meanwhile, genuinely great reps have no way to *prove* they're great.

This platform flips that. Reps upload proof of their numbers, an admin review process verifies it, and their public profile carries a verification tier that means something.

## What's built

**Phase 2: employer-paid job board** (`SPEC.md`, milestones M7–M12)

- **Sales jobs from SDR to CRO.** Levels (entry → executive), role categories, workplace, and **required pay ranges** (base, OTE, commission-only, or salary-only) on every listing
- **Search** with keyword (Postgres full-text), role, level, workplace, job type, min OTE and location filters
- **Employer accounts.** Company profile, draft → publish → close/renew (30-day listings), applicant pipeline with PDF resumes served via short-lived signed URLs
- **Sponsored jobs (the revenue engine).** Employers set a daily budget and cost per click, paid from prepaid credits. Up to 3 labeled sponsored slots per search, highest bid first. Charged once per viewer per day, never over budget, never below a $0 balance (row-locked transaction + DB check constraint)
- **Stripe billing.** Credit packs via Checkout, a Premium subscription (25 active jobs + badge vs 1 on free) with a 3-month launch coupon, and signature-verified, idempotent webhooks
- **Job seekers.** Free accounts, one-click apply with resume, application status tracker

**Phase 1: verified rep profiles** (`docs/SPEC-phase1-rep-profiles.md`): profiles, performance records, proof uploads with EXIF stripping, admin review, verification tiers. An applicant's published profile is linked on their applications.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind, React Router v6 |
| Server | Node + Express + TypeScript |
| Database | PostgreSQL + Drizzle ORM (schema shared in `shared/schema.ts`) |
| Validation | Zod schemas shared between client and server |
| Storage | Cloudflare R2 (`@aws-sdk/client-s3`) |
| Email | Resend |
| Testing | Vitest + Supertest (API tests per milestone) |

## Repository layout

```
/client     # Vite React SPA
/server     # Express API — routes, middleware, services (r2, email, image processing)
/shared     # Drizzle schema + Zod validators — single source of truth
/scripts    # seed.ts
SPEC.md     # full build spec — schema, milestones, acceptance criteria
```

This project was built spec-first: `SPEC.md` defines locked technology decisions, the exact database schema, milestone-by-milestone acceptance criteria, and security requirements, and each milestone was implemented and tested against it in order.

## Running locally

Requires Node 20+, PostgreSQL 15+.

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, SESSION_SECRET, etc.
npm run seed           # optional: admin, 10 rep profiles, 3 employers, 15 jobs
npm run dev            # starts API + Vite client
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/sales_job_board_test npm test
```

Credentials that are optional in dev:
- **Resend**: verification links are logged to the console.
- **Stripe**: with `placeholder…` keys, credit and Premium checkouts are fulfilled locally and logged as `[dev-billing]`. Placeholder Stripe keys are refused at boot in production.
- **R2**: needed for resume and proof uploads. Without it, uploads fail with a clear message and applying without a resume still works.

Seed logins: employers `talent@northwind-security.example.com` (and 2 others) / `employer1234!`, reps / `rep1234!`.

## Why I built this

I lead sales teams and hire salespeople. The gap between what a resume claims and what a rep has actually done is the most expensive problem in sales hiring — and it also holds back the reps who *do* have the numbers. This is my take on fixing both sides with verifiable proof.

## Roadmap

Parked for later (see `docs/PARKED-metrics-engine.md`): a structured metrics engine (numbers over any period), CSV and Salesforce imports, and premium access to rep dollar figures. Not built yet: messaging, job alerts, recruiter seats, click-fraud detection beyond per-viewer dedupe and budget caps.
