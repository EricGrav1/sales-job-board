import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getEnv } from "../server/config/env";
import { closeDb, db } from "../server/db";
import { recomputeVerificationTier } from "../server/services/verificationTier";
import { performanceRecords, proofItems, repProfiles, users } from "../shared/schema";

const ADMIN_PASSWORD = "admin1234!";
const REP_PASSWORD = "rep1234!";

type SeedRecord = {
  periodLabel: string;
  quotaAttainmentPct?: number;
  rank?: number;
  teamSize?: number;
  notes?: string;
};

type SeedProof = {
  type: "leaderboard" | "commission" | "award" | "other";
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  withRedactedKey?: boolean;
};

type SeedRep = {
  email: string;
  displayName: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  roleType: "sdr" | "ae" | "am" | "field" | "inside" | "manager" | "other" | null;
  industries: string[];
  yearsExperience: number | null;
  oteMin: number | null;
  oteMax: number | null;
  location: string | null;
  remoteOk: boolean;
  isPublished: boolean;
  records: SeedRecord[];
  proofs: SeedProof[];
};

const seedReps: SeedRep[] = [
  // --- verified: >=1 approved proof ---
  {
    email: "maya.chen@example.com",
    displayName: "Maya Chen",
    slug: "maya-chen",
    headline: "Top-decile SDR booking 30+ qualified meetings a month in cybersecurity",
    bio: "Two years of outbound prospecting into CISOs and security engineering leaders. Built my own sequencing playbook that took cold-call connect rates from 4% to 11%. Looking for a team that treats pipeline generation as a craft.",
    roleType: "sdr",
    industries: ["Cybersecurity", "SaaS"],
    yearsExperience: 2,
    oteMin: 65000,
    oteMax: 85000,
    location: "Austin, TX",
    remoteOk: true,
    isPublished: true,
    records: [
      { periodLabel: "Q1 2026", quotaAttainmentPct: 132, rank: 1, teamSize: 14, notes: "38 SQLs against a 29 SQL target" },
      { periodLabel: "Q4 2025", quotaAttainmentPct: 118, rank: 2, teamSize: 14 }
    ],
    proofs: [{ type: "leaderboard", status: "approved" }]
  },
  {
    email: "derek.okafor@example.com",
    displayName: "Derek Okafor",
    slug: "derek-okafor",
    headline: "Mid-market AE, $1.4M closed in FY25 at 121% of quota",
    bio: "Six years selling HR and payroll software to 200-2000 employee companies. Full-cycle: self-sourced roughly 40% of my closed-won pipeline last year. President's Club 2024 and 2025.",
    roleType: "ae",
    industries: ["HR Tech", "SaaS"],
    yearsExperience: 6,
    oteMin: 140000,
    oteMax: 180000,
    location: "New York, NY",
    remoteOk: false,
    isPublished: true,
    records: [
      { periodLabel: "FY 2025", quotaAttainmentPct: 121, rank: 3, teamSize: 22, notes: "$1.4M closed against $1.16M quota" },
      { periodLabel: "FY 2024", quotaAttainmentPct: 108, rank: 5, teamSize: 20 }
    ],
    proofs: [{ type: "commission", status: "approved", withRedactedKey: true }]
  },
  {
    email: "sofia.ramirez@example.com",
    displayName: "Sofia Ramirez",
    slug: "sofia-ramirez",
    headline: "Account Manager with 96% gross retention across a $3.2M book",
    bio: "Five years managing enterprise logistics accounts. I run structured QBRs, catch churn risk early, and expanded my book 24% last year through white-space mapping.",
    roleType: "am",
    industries: ["Logistics", "Supply Chain"],
    yearsExperience: 5,
    oteMin: 110000,
    oteMax: 140000,
    location: "Chicago, IL",
    remoteOk: true,
    isPublished: true,
    records: [
      { periodLabel: "FY 2025", quotaAttainmentPct: 112, teamSize: 9, notes: "Net revenue retention 124%" }
    ],
    proofs: [{ type: "award", status: "approved" }]
  },
  {
    email: "james.whitfield@example.com",
    displayName: "James Whitfield",
    slug: "james-whitfield",
    headline: "Field sales veteran selling surgical devices into hospital systems",
    bio: "Nine years in medtech field sales covering the Northeast. Deep relationships with OR staff and supply chain at 40+ hospitals. Consistent 100%+ performer through two territory realignments.",
    roleType: "field",
    industries: ["Medical Devices", "Healthcare"],
    yearsExperience: 9,
    oteMin: 160000,
    oteMax: 220000,
    location: "Boston, MA",
    remoteOk: false,
    isPublished: true,
    records: [
      { periodLabel: "FY 2025", quotaAttainmentPct: 109, rank: 4, teamSize: 18 },
      { periodLabel: "Q1 2026", quotaAttainmentPct: 97, rank: 6, teamSize: 18, notes: "Slow start; two hospital systems froze capex" }
    ],
    proofs: [
      { type: "leaderboard", status: "approved" },
      { type: "commission", status: "pending" }
    ]
  },
  // --- self_reported: >=1 record with attainment, no approved proof ---
  {
    email: "priya.natarajan@example.com",
    displayName: "Priya Natarajan",
    slug: "priya-natarajan",
    headline: "Inside sales rep closing SMB fintech deals at 4-day average cycle",
    bio: "Three years of high-velocity inside sales. 60+ dials a day, demo-to-close in under a week. Best month: 41 new logos.",
    roleType: "inside",
    industries: ["Fintech", "Payments"],
    yearsExperience: 3,
    oteMin: 80000,
    oteMax: 105000,
    location: "Salt Lake City, UT",
    remoteOk: true,
    isPublished: true,
    records: [
      { periodLabel: "Q2 2026", quotaAttainmentPct: 126, rank: 2, teamSize: 11 }
    ],
    proofs: [{ type: "leaderboard", status: "pending" }]
  },
  {
    email: "tom.gallagher@example.com",
    displayName: "Tom Gallagher",
    slug: "tom-gallagher",
    headline: "Sales manager who took a 6-rep pod from 71% to 104% attainment in three quarters",
    bio: "Eleven years in sales, four leading teams. I coach on call mechanics weekly, keep pipeline hygiene ruthless, and promoted three reps to senior roles last year.",
    roleType: "manager",
    industries: ["SaaS", "Martech"],
    yearsExperience: 11,
    oteMin: 190000,
    oteMax: 240000,
    location: "Denver, CO",
    remoteOk: false,
    isPublished: true,
    records: [
      { periodLabel: "Q1 2026", quotaAttainmentPct: 104, teamSize: 6, notes: "Team attainment" },
      { periodLabel: "Q4 2025", quotaAttainmentPct: 92, teamSize: 6, notes: "Team attainment" }
    ],
    proofs: []
  },
  {
    email: "aisha.bell@example.com",
    displayName: "Aisha Bell",
    slug: "aisha-bell",
    headline: "Enterprise AE selling data infrastructure, 143% in my best year",
    bio: "Four years selling to data platform teams at Fortune 1000s. Comfortable running technical evaluations with staff engineers and negotiating six-figure renewals with procurement.",
    roleType: "ae",
    industries: ["Data Infrastructure", "Cloud", "SaaS"],
    yearsExperience: 4,
    oteMin: 120000,
    oteMax: 150000,
    location: "Atlanta, GA",
    remoteOk: true,
    isPublished: true,
    records: [
      { periodLabel: "FY 2025", quotaAttainmentPct: 143, rank: 1, teamSize: 12, notes: "Closed largest deal in company history ($480K ARR)" }
    ],
    proofs: [{ type: "award", status: "rejected", rejectionReason: "Award screenshot does not show your name or the issuing company." }]
  },
  // --- unverified: profile only, or records without attainment ---
  {
    email: "nate.kowalski@example.com",
    displayName: "Nate Kowalski",
    slug: "nate-kowalski",
    headline: "First-year SDR hungry to break into tech sales full-time",
    bio: "One year of outbound at a Phoenix startup. Still learning, but I show up early, take coaching hard, and my activity numbers lead the pod.",
    roleType: "sdr",
    industries: ["SaaS"],
    yearsExperience: 1,
    oteMin: 55000,
    oteMax: 75000,
    location: "Phoenix, AZ",
    remoteOk: false,
    isPublished: true,
    records: [
      { periodLabel: "Q2 2026", rank: 3, teamSize: 8, notes: "Ranked by activity; quota not yet assigned" }
    ],
    proofs: []
  },
  {
    email: "hannah.lindqvist@example.com",
    displayName: "Hannah Lindqvist",
    slug: "hannah-lindqvist",
    headline: "Strategic account manager for Nordic and DACH enterprise accounts",
    bio: "Seven years managing cross-border enterprise relationships in manufacturing software. Trilingual: English, Swedish, German.",
    roleType: "am",
    industries: ["Manufacturing", "Industrial Software"],
    yearsExperience: 7,
    oteMin: 100000,
    oteMax: 130000,
    location: "Seattle, WA",
    remoteOk: true,
    isPublished: true,
    records: [],
    proofs: []
  },
  {
    email: "carlos.mendes@example.com",
    displayName: "Carlos Mendes",
    slug: "carlos-mendes",
    headline: null,
    bio: null,
    roleType: "ae",
    industries: [],
    yearsExperience: 8,
    oteMin: null,
    oteMax: null,
    location: null,
    remoteOk: false,
    isPublished: false,
    records: [],
    proofs: []
  }
];

async function upsertUser(email: string, passwordHash: string, role: "rep" | "admin") {
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      role,
      emailVerifiedAt: new Date()
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        passwordHash,
        role,
        emailVerifiedAt: new Date()
      }
    })
    .returning();

  return user;
}

async function findAvailableSlug(base: string, userId: string) {
  let candidate = base;
  for (let suffix = 2; ; suffix += 1) {
    const existing = await db.query.repProfiles.findFirst({
      where: eq(repProfiles.slug, candidate)
    });
    if (!existing || existing.userId === userId) {
      return candidate;
    }
    candidate = `${base}-${suffix}`;
  }
}

async function seedRep(rep: SeedRep, passwordHash: string, adminUserId: string) {
  const user = await upsertUser(rep.email, passwordHash, "rep");
  const slug = await findAvailableSlug(rep.slug, user.id);

  const profileValues = {
    slug,
    displayName: rep.displayName,
    headline: rep.headline,
    bio: rep.bio,
    roleType: rep.roleType,
    industries: rep.industries,
    yearsExperience: rep.yearsExperience,
    oteMin: rep.oteMin,
    oteMax: rep.oteMax,
    location: rep.location,
    remoteOk: rep.remoteOk,
    isPublished: rep.isPublished,
    updatedAt: new Date()
  };

  const [profile] = await db
    .insert(repProfiles)
    .values({ userId: user.id, ...profileValues })
    .onConflictDoUpdate({
      target: repProfiles.userId,
      set: profileValues
    })
    .returning();

  // Replace child rows so re-runs stay deterministic instead of accumulating duplicates.
  await db.delete(proofItems).where(eq(proofItems.profileId, profile.id));
  await db.delete(performanceRecords).where(eq(performanceRecords.profileId, profile.id));

  if (rep.records.length > 0) {
    await db.insert(performanceRecords).values(
      rep.records.map((record) => ({
        profileId: profile.id,
        periodLabel: record.periodLabel,
        quotaAttainmentPct: record.quotaAttainmentPct ?? null,
        rank: record.rank ?? null,
        teamSize: record.teamSize ?? null,
        notes: record.notes ?? null
      }))
    );
  }

  if (rep.proofs.length > 0) {
    await db.insert(proofItems).values(
      rep.proofs.map((proof) => {
        const baseKey = `proofs/${profile.id}/${randomUUID()}-original`;
        const reviewed = proof.status !== "pending";
        return {
          profileId: profile.id,
          originalKey: `${baseKey}.jpg`,
          thumbKey: `${baseKey}-thumb.jpg`,
          redactedKey: proof.withRedactedKey ? `${baseKey}-redacted.jpg` : null,
          type: proof.type,
          status: proof.status,
          rejectionReason: proof.rejectionReason ?? null,
          reviewedByUserId: reviewed ? adminUserId : null,
          reviewedAt: reviewed ? new Date() : null
        };
      })
    );
  }

  const updatedProfile = await recomputeVerificationTier(profile.id);

  return {
    email: rep.email,
    slug: updatedProfile.slug,
    tier: updatedProfile.verificationTier,
    published: updatedProfile.isPublished,
    records: rep.records.length,
    proofs: rep.proofs.length
  };
}

async function main() {
  const env = getEnv();

  console.log(`Seeding database: ${env.DATABASE_URL}`);

  const [adminPasswordHash, repPasswordHash] = await Promise.all([
    bcrypt.hash(ADMIN_PASSWORD, 12),
    bcrypt.hash(REP_PASSWORD, 12)
  ]);

  const admin = await upsertUser(env.ADMIN_EMAIL, adminPasswordHash, "admin");
  console.log(`Admin: ${admin.email} / ${ADMIN_PASSWORD}`);
  console.log(`Reps:  <email below> / ${REP_PASSWORD}`);

  const summary = [];
  for (const rep of seedReps) {
    summary.push(await seedRep(rep, repPasswordHash, admin.id));
  }

  console.table(summary);
  console.log(`Seeded 1 admin + ${summary.length} rep profiles.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
