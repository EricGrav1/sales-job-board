import { JOB_DESCRIPTION_MIN } from "../../shared/jobs";
import type { Job } from "../../shared/schema";

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

// SPEC §6 publish requirements. Returns { field: reason }; empty means publishable.
export function publishBlockers(job: Job) {
  const reasons: Record<string, string> = {};

  if (!hasText(job.title)) reasons.title = "Title is required";
  if (!job.category) reasons.category = "Category is required";
  if (!job.level) reasons.level = "Level is required";
  if (!job.employmentType) reasons.employmentType = "Employment type is required";
  if (!job.workplace) reasons.workplace = "Workplace is required";
  if (!hasText(job.location)) reasons.location = "Location is required";
  if ((job.description?.trim().length ?? 0) < JOB_DESCRIPTION_MIN) {
    reasons.description = `Description must be at least ${JOB_DESCRIPTION_MIN} characters`;
  }

  if (!job.compType) {
    reasons.compType = "Compensation type is required";
  } else {
    const needsBase = job.compType !== "commission_only";
    const needsOte = job.compType !== "salary_only";

    if (needsBase && (job.baseMin == null || job.baseMax == null)) {
      reasons.baseMin = "Base pay range is required";
    }
    if (needsOte && (job.oteMin == null || job.oteMax == null)) {
      reasons.oteMin = "OTE range is required";
    }
    if (job.baseMin != null && job.baseMax != null && job.baseMin > job.baseMax) {
      reasons.baseMin = "Base minimum must be less than or equal to base maximum";
    }
    if (job.oteMin != null && job.oteMax != null && job.oteMin > job.oteMax) {
      reasons.oteMin = "OTE minimum must be less than or equal to OTE maximum";
    }
    if (job.compType === "base_plus_commission" && job.oteMin != null && job.baseMin != null && job.oteMin < job.baseMin) {
      reasons.oteMin = "OTE minimum cannot be lower than base minimum";
    }
  }

  if (job.applyMethod === "external" && !job.applyUrl?.startsWith("https://")) {
    reasons.applyUrl = "An https:// application URL is required for external applications";
  }

  return reasons;
}

export function isJobOpen(job: Pick<Job, "status" | "expiresAt">, now = new Date()) {
  return job.status === "published" && job.expiresAt != null && job.expiresAt > now;
}
