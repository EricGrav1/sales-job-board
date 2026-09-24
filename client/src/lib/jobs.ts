import type { CompType, EmploymentType, JobCategory, JobLevel, Workplace } from "../../../shared/jobs";

export type JobCard = {
  id: string;
  slug: string;
  title: string;
  category: JobCategory;
  level: JobLevel;
  employmentType: EmploymentType;
  workplace: Workplace;
  location: string;
  compType: CompType;
  baseMin: number | null;
  baseMax: number | null;
  oteMin: number | null;
  oteMax: number | null;
  applyMethod: "platform" | "external";
  applyUrl: string | null;
  publishedAt: string;
  expiresAt: string;
  company: { name: string; slug: string; website: string | null; premium: boolean };
  clickToken?: string;
};

export type JobDetail = JobCard & {
  description: string;
  company: JobCard["company"] & { description: string | null; sizeBand: string | null };
};

export type JobSearchResponse = {
  sponsored: JobCard[];
  results: JobCard[];
  total: number;
  page: number;
  pageSize: number;
};

export type EmployerJob = {
  id: string;
  slug: string;
  title: string;
  category: JobCategory | null;
  level: JobLevel | null;
  employmentType: EmploymentType | null;
  workplace: Workplace | null;
  location: string | null;
  compType: CompType | null;
  baseMin: number | null;
  baseMax: number | null;
  oteMin: number | null;
  oteMax: number | null;
  description: string | null;
  applyMethod: "platform" | "external";
  applyUrl: string | null;
  status: "draft" | "published" | "closed";
  state: "draft" | "published" | "closed" | "expired";
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  stats?: { views: number; applications?: number; impressions?: number; clicks?: number; spendCents?: number };
};

function compact(amount: number) {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (amount >= 1000) {
    return `$${Math.round(amount / 1000)}k`;
  }
  return `$${amount}`;
}

function range(min: number | null, max: number | null) {
  if (min == null || max == null) {
    return null;
  }
  return min === max ? compact(min) : `${compact(min)}–${compact(max)}`;
}

// "$80k–$95k base · $160k–$190k OTE"
export function formatPay(job: Pick<JobCard, "compType" | "baseMin" | "baseMax" | "oteMin" | "oteMax">) {
  const base = range(job.baseMin, job.baseMax);
  const ote = range(job.oteMin, job.oteMax);
  if (job.compType === "salary_only") {
    return base ? `${base} salary` : "";
  }
  if (job.compType === "commission_only") {
    return ote ? `${ote} OTE · commission only` : "";
  }
  return [base ? `${base} base` : null, ote ? `${ote} OTE` : null].filter(Boolean).join(" · ");
}

export function formatCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
