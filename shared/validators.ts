import { z } from "zod";

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
