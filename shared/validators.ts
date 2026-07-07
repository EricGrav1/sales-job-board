import { z } from "zod";

const normalizedEmail = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());

export const registerSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(8).max(128)
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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ProfileUpsertInput = z.infer<typeof profileUpsertSchema>;
