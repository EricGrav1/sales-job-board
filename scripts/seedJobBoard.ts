import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { JOB_LISTING_DAYS, type CompType, type EmploymentType, type JobCategory, type JobLevel, type Workplace } from "../shared/jobs";
import { companies, companyMembers, creditLedger, jobs, promotions, users } from "../shared/schema";

export const EMPLOYER_PASSWORD = "employer1234!";

type SeedCompany = {
  ownerEmail: string;
  name: string;
  slug: string;
  website: string;
  description: string;
  sizeBand: "1-10" | "11-50" | "51-200" | "201-1000" | "1000+";
  plan: "free" | "premium";
  creditsCents: number;
};

type SeedJob = {
  companySlug: string;
  slug: string;
  title: string;
  category: JobCategory;
  level: JobLevel;
  employmentType: EmploymentType;
  workplace: Workplace;
  location: string;
  compType: CompType;
  baseMin?: number;
  baseMax?: number;
  oteMin?: number;
  oteMax?: number;
  description: string;
  applyUrl?: string;
  daysAgo: number;
  promotion?: { dailyBudgetCents: number; cpcCents: number };
};

const seedCompanies: SeedCompany[] = [
  {
    ownerEmail: "talent@northwind-security.example.com",
    name: "Northwind Security",
    slug: "northwind-security",
    website: "https://northwind-security.example.com",
    description:
      "Cloud security platform for mid-market and enterprise IT teams. Series C, 400 employees, sales org of 90 across SDR, AE, and CS.",
    sizeBand: "201-1000",
    plan: "premium",
    creditsCents: 25000
  },
  {
    ownerEmail: "hiring@brightpath-hr.example.com",
    name: "BrightPath HR",
    slug: "brightpath-hr",
    website: "https://brightpath-hr.example.com",
    description: "Payroll and HR software for companies with 50–2,000 employees. Profitable, 150 people, remote-first.",
    sizeBand: "51-200",
    plan: "premium",
    creditsCents: 0
  },
  {
    ownerEmail: "founder@ledgerly.example.com",
    name: "Ledgerly",
    slug: "ledgerly",
    website: "https://ledgerly.example.com",
    description: "Seed-stage AP automation startup. Hiring our first sales team.",
    sizeBand: "11-50",
    plan: "free",
    creditsCents: 0
  }
];

const seedJobs: SeedJob[] = [
  {
    companySlug: "northwind-security",
    slug: "sdr-cybersecurity-northwind-security",
    title: "Sales Development Representative (Cybersecurity)",
    category: "sdr_bdr",
    level: "entry",
    employmentType: "full_time",
    workplace: "hybrid",
    location: "Austin, TX",
    compType: "base_plus_commission",
    baseMin: 55000,
    baseMax: 62000,
    oteMin: 80000,
    oteMax: 90000,
    description:
      "Book qualified meetings for our mid-market AE team selling cloud security to IT leaders.\n\n• Target: 12 qualified meetings/month after a 2-month ramp\n• Cold calls, email sequences, LinkedIn\n• Promotion path to AE in 12–18 months (8 SDRs promoted last year)\n\nNo security background needed. We train you.",
    daysAgo: 1,
    promotion: { dailyBudgetCents: 2000, cpcCents: 150 }
  },
  {
    companySlug: "brightpath-hr",
    slug: "bdr-remote-brightpath-hr",
    title: "Business Development Representative",
    category: "sdr_bdr",
    level: "entry",
    employmentType: "full_time",
    workplace: "remote",
    location: "Remote (US)",
    compType: "base_plus_commission",
    baseMin: 50000,
    baseMax: 58000,
    oteMin: 72000,
    oteMax: 82000,
    description:
      "Prospect into HR and finance leaders at 50–2,000 employee companies. Mostly outbound, with inbound follow-up. Quota: 10 SQOs a month. Weekly 1:1 coaching and call reviews.",
    daysAgo: 3
  },
  {
    companySlug: "ledgerly",
    slug: "founding-sdr-ledgerly",
    title: "Founding SDR",
    category: "sdr_bdr",
    level: "entry",
    employmentType: "full_time",
    workplace: "onsite",
    location: "Chicago, IL",
    compType: "base_plus_commission",
    baseMin: 60000,
    baseMax: 65000,
    oteMin: 90000,
    oteMax: 95000,
    description:
      "Be our first SDR. You'll help write the outbound playbook with the founder, test messaging to controllers and CFOs, and book meetings the founder runs. Equity included. Expect ambiguity.",
    daysAgo: 6
  },
  {
    companySlug: "northwind-security",
    slug: "mid-market-ae-northwind-security",
    title: "Mid-Market Account Executive",
    category: "account_executive",
    level: "mid",
    employmentType: "full_time",
    workplace: "remote",
    location: "Remote (US)",
    compType: "base_plus_commission",
    baseMin: 85000,
    baseMax: 100000,
    oteMin: 170000,
    oteMax: 200000,
    description:
      "Full-cycle sales to 200–2,000 employee companies. $45k average ACV, 60-day cycles, about 50% SDR-sourced pipeline. Annual quota $780k new ARR. 68% of AEs hit quota last year.",
    daysAgo: 2,
    promotion: { dailyBudgetCents: 3000, cpcCents: 250 }
  },
  {
    companySlug: "brightpath-hr",
    slug: "account-executive-smb-brightpath-hr",
    title: "Account Executive, SMB",
    category: "account_executive",
    level: "mid",
    employmentType: "full_time",
    workplace: "remote",
    location: "Remote (US)",
    compType: "base_plus_commission",
    baseMin: 70000,
    baseMax: 80000,
    oteMin: 140000,
    oteMax: 160000,
    description:
      "High-velocity sales to 50–200 employee companies. 20–30 day cycles, $12k ACV, mostly inbound. You run 15–20 demos a week.",
    daysAgo: 5
  },
  {
    companySlug: "brightpath-hr",
    slug: "account-manager-brightpath-hr",
    title: "Account Manager, Expansion",
    category: "account_manager",
    level: "mid",
    employmentType: "full_time",
    workplace: "remote",
    location: "Remote (US)",
    compType: "base_plus_commission",
    baseMin: 75000,
    baseMax: 85000,
    oteMin: 125000,
    oteMax: 140000,
    description:
      "Own a book of 120 existing customers. Drive expansion (new modules, headcount growth) and protect renewals. Target: 110% net revenue retention on your book.",
    daysAgo: 9
  },
  {
    companySlug: "northwind-security",
    slug: "enterprise-ae-northwind-security",
    title: "Enterprise Account Executive",
    category: "account_executive",
    level: "senior",
    employmentType: "full_time",
    workplace: "remote",
    location: "Remote (East Coast)",
    compType: "base_plus_commission",
    baseMin: 150000,
    baseMax: 170000,
    oteMin: 300000,
    oteMax: 340000,
    description:
      "Land Fortune 1000 security teams. $250k+ ACV, 6–9 month cycles, a dedicated SE and SDR. You'll need a track record of closing multi-stakeholder, six-figure deals.",
    daysAgo: 4,
    promotion: { dailyBudgetCents: 5000, cpcCents: 400 }
  },
  {
    companySlug: "northwind-security",
    slug: "senior-solutions-engineer-northwind-security",
    title: "Senior Solutions Engineer",
    category: "sales_engineer",
    level: "senior",
    employmentType: "full_time",
    workplace: "hybrid",
    location: "New York, NY",
    compType: "base_plus_commission",
    baseMin: 165000,
    baseMax: 185000,
    oteMin: 210000,
    oteMax: 235000,
    description:
      "Partner with enterprise AEs on discovery, demos, and proofs of concept. Paid on team attainment (80/20 split). Cloud and network security experience required.",
    daysAgo: 12
  },
  {
    companySlug: "brightpath-hr",
    slug: "sdr-manager-brightpath-hr",
    title: "SDR Manager",
    category: "sales_management",
    level: "manager",
    employmentType: "full_time",
    workplace: "remote",
    location: "Remote (US)",
    compType: "base_plus_commission",
    baseMin: 110000,
    baseMax: 125000,
    oteMin: 155000,
    oteMax: 175000,
    description:
      "Lead a team of 8 BDRs. Hire, coach, and run the pipeline-generation engine for SMB and mid-market. Paid on team SQO attainment and promotions out of the team.",
    daysAgo: 7
  },
  {
    companySlug: "northwind-security",
    slug: "revops-manager-northwind-security",
    title: "Revenue Operations Manager",
    category: "sales_operations",
    level: "manager",
    employmentType: "full_time",
    workplace: "hybrid",
    location: "Austin, TX",
    compType: "salary_only",
    baseMin: 130000,
    baseMax: 150000,
    description:
      "Own Salesforce, territory and quota planning, and forecasting for a 90-person sales org. You'll partner with the CRO on comp plan design.",
    daysAgo: 15
  },
  {
    companySlug: "brightpath-hr",
    slug: "director-of-sales-mid-market-brightpath-hr",
    title: "Director of Sales, Mid-Market",
    category: "sales_management",
    level: "director",
    employmentType: "full_time",
    workplace: "remote",
    location: "Remote (US)",
    compType: "base_plus_commission",
    baseMin: 170000,
    baseMax: 190000,
    oteMin: 260000,
    oteMax: 290000,
    description:
      "Run two AE teams (14 reps) and their managers. Own the mid-market number ($9M new ARR), forecasting, and hiring plan.",
    daysAgo: 8
  },
  {
    companySlug: "northwind-security",
    slug: "director-channel-partnerships-northwind-security",
    title: "Director, Channel & Partnerships",
    category: "channel_partnerships",
    level: "director",
    employmentType: "full_time",
    workplace: "remote",
    location: "Remote (US)",
    compType: "base_plus_commission",
    baseMin: 175000,
    baseMax: 195000,
    oteMin: 250000,
    oteMax: 280000,
    description:
      "Build our MSSP and reseller channel from 10% to 30% of new bookings. Recruit and enable partners and co-sell with direct teams.",
    applyUrl: "https://northwind-security.example.com/careers/channel-director",
    daysAgo: 10
  },
  {
    companySlug: "northwind-security",
    slug: "vp-sales-enterprise-northwind-security",
    title: "VP of Sales, Enterprise",
    category: "sales_leadership",
    level: "vp",
    employmentType: "full_time",
    workplace: "hybrid",
    location: "New York, NY",
    compType: "base_plus_commission",
    baseMin: 250000,
    baseMax: 280000,
    oteMin: 450000,
    oteMax: 500000,
    description:
      "Lead the enterprise segment: 5 managers, 35 AEs, $28M number. Reports to the CRO. Experience scaling enterprise security sales past $50M ARR preferred.",
    daysAgo: 11
  },
  {
    companySlug: "brightpath-hr",
    slug: "commission-only-rep-brightpath-hr",
    title: "Independent Sales Representative (1099)",
    category: "account_executive",
    level: "mid",
    employmentType: "contract",
    workplace: "remote",
    location: "Remote (US)",
    compType: "commission_only",
    oteMin: 90000,
    oteMax: 150000,
    description:
      "Commission-only: 20% of first-year contract value, paid monthly as the customer pays. Best fit if you already sell to HR or finance leaders at small businesses and want to add a complementary product.",
    daysAgo: 13
  },
  {
    companySlug: "brightpath-hr",
    slug: "chief-revenue-officer-brightpath-hr",
    title: "Chief Revenue Officer",
    category: "sales_leadership",
    level: "executive",
    employmentType: "full_time",
    workplace: "remote",
    location: "Remote (US)",
    compType: "base_plus_commission",
    baseMin: 300000,
    baseMax: 340000,
    oteMin: 520000,
    oteMax: 600000,
    description:
      "Own new business, expansion, and renewals across a 60-person revenue org as we scale from $40M to $100M ARR. Reports to the CEO; board-facing.",
    daysAgo: 2
  }
];

async function upsertEmployer(email: string, passwordHash: string) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, role: "employer", emailVerifiedAt: new Date() })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash, role: "employer", emailVerifiedAt: new Date() } })
    .returning();
  return user;
}

export async function seedJobBoard(employerPasswordHash: string) {
  const companyIds = new Map<string, string>();

  for (const seed of seedCompanies) {
    const owner = await upsertEmployer(seed.ownerEmail, employerPasswordHash);
    const values = {
      name: seed.name,
      website: seed.website,
      description: seed.description,
      sizeBand: seed.sizeBand,
      plan: seed.plan,
      premiumCurrentPeriodEnd: seed.plan === "premium" ? new Date(Date.now() + 30 * 86_400_000) : null,
      creditBalanceCents: seed.creditsCents,
      updatedAt: new Date()
    };
    const [company] = await db
      .insert(companies)
      .values({ ...values, slug: seed.slug })
      .onConflictDoUpdate({ target: companies.slug, set: values })
      .returning();
    companyIds.set(seed.slug, company.id);

    await db.insert(companyMembers).values({ companyId: company.id, userId: owner.id, role: "owner" }).onConflictDoNothing();

    // Keep the ledger consistent with the balance on every re-run.
    await db.delete(creditLedger).where(eq(creditLedger.companyId, company.id));
    if (seed.creditsCents > 0) {
      await db.insert(creditLedger).values({ companyId: company.id, amountCents: seed.creditsCents, type: "adjustment" });
    }
  }

  const summary = [];
  for (const seed of seedJobs) {
    const companyId = companyIds.get(seed.companySlug)!;
    const publishedAt = new Date(Date.now() - seed.daysAgo * 86_400_000);
    const values = {
      companyId,
      title: seed.title,
      category: seed.category,
      level: seed.level,
      employmentType: seed.employmentType,
      workplace: seed.workplace,
      location: seed.location,
      compType: seed.compType,
      baseMin: seed.baseMin ?? null,
      baseMax: seed.baseMax ?? null,
      oteMin: seed.oteMin ?? null,
      oteMax: seed.oteMax ?? null,
      description: seed.description,
      applyMethod: seed.applyUrl ? ("external" as const) : ("platform" as const),
      applyUrl: seed.applyUrl ?? null,
      status: "published" as const,
      publishedAt,
      expiresAt: new Date(publishedAt.getTime() + JOB_LISTING_DAYS * 86_400_000),
      updatedAt: new Date()
    };
    const [job] = await db
      .insert(jobs)
      .values({ ...values, slug: seed.slug })
      .onConflictDoUpdate({ target: jobs.slug, set: values })
      .returning();

    if (seed.promotion) {
      await db
        .insert(promotions)
        .values({ jobId: job.id, companyId, status: "active", ...seed.promotion })
        .onConflictDoUpdate({ target: promotions.jobId, set: { status: "active", ...seed.promotion, updatedAt: new Date() } });
    }

    summary.push({ company: seed.companySlug, level: seed.level, title: seed.title, sponsored: Boolean(seed.promotion) });
  }

  return { companies: seedCompanies.map((company) => company.ownerEmail), jobs: summary };
}
