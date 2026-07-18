# 🏆 Sales Rep Job Board

A job platform where sales reps build profiles backed by **verified performance proof** — leaderboard screenshots, quota attainment, awards — instead of just claims on a resume.

## The problem

Hiring salespeople is broken in a specific way: every resume says "President's Club" and "150% of quota," and hiring managers have no way to tell the real performers from the storytellers. Meanwhile, genuinely great reps have no way to *prove* they're great.

This platform flips that. Reps upload proof of their numbers, an admin review process verifies it, and their public profile carries a verification tier that means something.

## What's built (Phase 1 — rep side MVP)

- **Auth** — email/password registration with email verification, session-based login (`express-session` + Postgres store, bcrypt)
- **Rep profiles** — role type, industries, years of experience, OTE range, location/remote, publish control, public page at `/r/:slug`
- **Performance records** — per-period quota attainment, rank, team size, with validation (0–500% attainment enforced)
- **Proof uploads** — screenshots go to Cloudflare R2 via presigned URLs; EXIF metadata is stripped and thumbnails generated with `sharp`; originals are **never** served publicly
- **Admin review** — pending-proof queue with signed access to originals, approve/reject with email notifications, redacted public versions
- **Verification tiers** — `unverified → self_reported → verified`, computed from approved proof
- **Analytics events** — profile views tracked from day one
- **Seed data** — `npm run seed` creates an admin plus 10 realistic rep profiles across all tiers

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
npm run seed           # optional: admin + sample rep profiles
npm run dev            # starts API + Vite client
npm test               # vitest + supertest suite
```

R2 and Resend credentials are optional in dev — email verification links are logged to the console instead.

## Why I built this

I lead sales teams and hire salespeople. The gap between what a resume claims and what a rep has actually done is the most expensive problem in sales hiring — and it also holds back the reps who *do* have the numbers. This is my take on fixing both sides with verifiable proof.

## Roadmap

Phase 1 is rep-side only — no employer accounts, payments, or messaging yet. Those are the next phases.
