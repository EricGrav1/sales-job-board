import type { Company, Job } from "../../shared/schema";
import { planFor } from "./plans";

// Allowlist serializer for anything shown to the public. Never spread a DB row into a public response.
export function toPublicJob(job: Job, company: Pick<Company, "name" | "slug" | "website" | "plan">) {
  return {
    id: job.id,
    slug: job.slug,
    title: job.title,
    category: job.category,
    level: job.level,
    employmentType: job.employmentType,
    workplace: job.workplace,
    location: job.location,
    compType: job.compType,
    baseMin: job.baseMin,
    baseMax: job.baseMax,
    oteMin: job.oteMin,
    oteMax: job.oteMax,
    applyMethod: job.applyMethod,
    applyUrl: job.applyMethod === "external" ? job.applyUrl : null,
    publishedAt: job.publishedAt,
    expiresAt: job.expiresAt,
    company: {
      name: company.name,
      slug: company.slug,
      website: company.website,
      premium: planFor(company).premiumBadge
    }
  };
}

export type PublicJob = ReturnType<typeof toPublicJob>;
