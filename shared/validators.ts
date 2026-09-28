import { z } from "zod";
import {
  JOB_DESCRIPTION_MAX,
  compTypeValues,
  employmentTypeValues,
  jobCategoryValues,
  jobLevelValues,
  workplaceValues
} from "./jobs";
import { CREDIT_PACKS_CENTS } from "./billing";
import { MAX_CPC_CENTS, MAX_DAILY_BUDGET_CENTS, MIN_CPC_CENTS, MIN_DAILY_BUDGET_CENTS } from "./promotions";

const normalizedEmail = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());

export const accountTypeSchema = z.enum(["job_seeker", "employer"]);

export const registerSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(8).max(128),
  accountType: accountTypeSchema.default("job_seeker")
});

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1).max(128)
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1)
});

export const roleTypeSchema = z.enum(["sdr", "ae", "am", "field", "inside", "manager", "other"]);

export const profileUpsertSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    headline: z.string().trim().max(120).nullable().optional(),
    bio: z.string().trim().max(2000).nullable().optional(),
    roleType: roleTypeSchema.nullable().optional(),
    industries: z.array(z.string().trim().min(1).max(80)).max(5).default([]),
    yearsExperience: z.number().int().min(0).max(60).nullable().optional(),
    oteMin: z.number().int().min(0).nullable().optional(),
    oteMax: z.number().int().min(0).nullable().optional(),
    location: z.string().trim().max(160).nullable().optional(),
    remoteOk: z.boolean().default(false)
  })
  .refine(
    (data) => data.oteMin == null || data.oteMax == null || data.oteMin <= data.oteMax,
    {
      message: "oteMin must be less than or equal to oteMax",
      path: ["oteMin"]
    }
  );

export const performanceRecordSchema = z.object({
  periodLabel: z.string().trim().min(1).max(120),
  quotaAttainmentPct: z.number().int().min(0).max(500).nullable().optional(),
  rank: z.number().int().nullable().optional(),
  teamSize: z.number().int().nullable().optional(),
  notes: z.string().trim().max(280).nullable().optional()
});

export const recordParamsSchema = z.object({
  id: z.string().uuid()
});

export const proofTypeSchema = z.enum(["leaderboard", "commission", "award", "other"]);

export const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024;

export const proofContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf"
]);

export const proofUploadSchema = z.object({
  type: proofTypeSchema,
  contentType: proofContentTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_PROOF_SIZE_BYTES)
});

export const proofParamsSchema = z.object({
  id: z.string().uuid()
});

export const proofStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const adminProofsQuerySchema = z.object({
  status: proofStatusSchema.default("pending")
});

export const proofRejectSchema = z.object({
  reason: z.string().trim().min(1).max(1000)
});

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => value.startsWith("https://"), { message: "Must be an https:// URL" });

export const companySizeBandSchema = z.enum(["1-10", "11-50", "51-200", "201-1000", "1000+"]);

export const companyUpsertSchema = z.object({
  name: z.string().trim().min(1).max(120),
  website: httpsUrl.nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sizeBand: companySizeBandSchema.nullable().optional()
});

const payAmount = z.number().int().min(0).max(10_000_000).nullable().optional();

function rangeOrdered(min: number | null | undefined, max: number | null | undefined) {
  return min == null || max == null || min <= max;
}

// Drafts can be partial; completeness is checked at publish time (server/services/jobRules.ts).
export const jobUpsertSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    category: z.enum(jobCategoryValues).nullable().optional(),
    level: z.enum(jobLevelValues).nullable().optional(),
    employmentType: z.enum(employmentTypeValues).nullable().optional(),
    workplace: z.enum(workplaceValues).nullable().optional(),
    location: z.string().trim().max(160).nullable().optional(),
    compType: z.enum(compTypeValues).nullable().optional(),
    baseMin: payAmount,
    baseMax: payAmount,
    oteMin: payAmount,
    oteMax: payAmount,
    description: z.string().trim().max(JOB_DESCRIPTION_MAX).nullable().optional(),
    applyMethod: z.enum(["platform", "external"]).default("platform"),
    applyUrl: httpsUrl.nullable().optional()
  })
  .refine((data) => rangeOrdered(data.baseMin, data.baseMax), {
    message: "Base minimum must be less than or equal to base maximum",
    path: ["baseMin"]
  })
  .refine((data) => rangeOrdered(data.oteMin, data.oteMax), {
    message: "OTE minimum must be less than or equal to OTE maximum",
    path: ["oteMin"]
  });

export const idParamsSchema = z.object({
  id: z.string().uuid()
});

const optionalQueryEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), z.enum(values).optional());

export const jobSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: optionalQueryEnum(jobCategoryValues),
  level: optionalQueryEnum(jobLevelValues),
  workplace: optionalQueryEnum(workplaceValues),
  employmentType: optionalQueryEnum(employmentTypeValues),
  minOte: z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().min(0).max(10_000_000).optional()),
  location: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1)
});

export const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;

export const resumeUploadSchema = z.object({
  contentType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive().max(MAX_RESUME_SIZE_BYTES)
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const applySchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: optionalText(40),
  linkedinUrl: z
    .string()
    .trim()
    .max(300)
    .regex(/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/\S+$/i, "Must be an https://linkedin.com/... URL")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  resumeKey: z.string().max(300).nullable().optional(),
  coverNote: optionalText(3000)
});

export const applicationStatusSchema = z.enum(["new", "reviewed", "interviewing", "offer", "hired", "rejected"]);

export const applicationStatusUpdateSchema = z.object({
  status: applicationStatusSchema
});

export const clickSchema = z.object({
  clickToken: z.string().min(1).max(300)
});

export const promotionUpsertSchema = z
  .object({
    status: z.enum(["active", "paused"]),
    dailyBudgetCents: z.number().int().min(MIN_DAILY_BUDGET_CENTS).max(MAX_DAILY_BUDGET_CENTS),
    cpcCents: z.number().int().min(MIN_CPC_CENTS).max(MAX_CPC_CENTS)
  })
  .refine((data) => data.cpcCents <= data.dailyBudgetCents, {
    message: "Cost per click can't exceed the daily budget",
    path: ["cpcCents"]
  });

export const creditsCheckoutSchema = z.object({
  amountCents: z
    .number()
    .int()
    .refine((value) => (CREDIT_PACKS_CENTS as readonly number[]).includes(value), { message: "Choose one of the credit packs" })
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ProfileUpsertInput = z.infer<typeof profileUpsertSchema>;
export type PerformanceRecordInput = z.infer<typeof performanceRecordSchema>;
export type RecordParamsInput = z.infer<typeof recordParamsSchema>;
export type ProofUploadInput = z.infer<typeof proofUploadSchema>;
export type ProofParamsInput = z.infer<typeof proofParamsSchema>;
export type AdminProofsQueryInput = z.infer<typeof adminProofsQuerySchema>;
export type ProofRejectInput = z.infer<typeof proofRejectSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;
export type CompanyUpsertInput = z.infer<typeof companyUpsertSchema>;
export type JobUpsertInput = z.infer<typeof jobUpsertSchema>;
export type JobSearchQuery = z.infer<typeof jobSearchQuerySchema>;
export type ApplyInput = z.infer<typeof applySchema>;
export type PromotionUpsertInput = z.infer<typeof promotionUpsertSchema>;
