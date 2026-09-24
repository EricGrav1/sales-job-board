import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requireEmailVerified, requireRole } from "../middleware/auth";
import { validateBody, validateParams } from "../middleware/validate";
import { recomputeVerificationTier } from "../services/verificationTier";
import { asyncHandler } from "../utils/http";
import { performanceRecords, repProfiles, type RepProfile } from "../../shared/schema";
import {
  performanceRecordSchema,
  recordParamsSchema,
  type PerformanceRecordInput
} from "../../shared/validators";

export const recordsRouter = Router();

recordsRouter.use(asyncHandler(requireAuth), requireEmailVerified, requireRole("rep", "admin"));

async function findOwnProfile(userId: string) {
  return db.query.repProfiles.findFirst({
    where: eq(repProfiles.userId, userId)
  });
}

async function findOwnRecord(recordId: string, profile: RepProfile) {
  return db.query.performanceRecords.findFirst({
    where: and(eq(performanceRecords.id, recordId), eq(performanceRecords.profileId, profile.id))
  });
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function recordValues(input: PerformanceRecordInput) {
  return {
    periodLabel: input.periodLabel,
    quotaAttainmentPct: input.quotaAttainmentPct ?? null,
    rank: input.rank ?? null,
    teamSize: input.teamSize ?? null,
    notes: optionalText(input.notes)
  };
}

recordsRouter.post(
  "/",
  validateBody(performanceRecordSchema),
  asyncHandler(async (req, res) => {
    const profile = await findOwnProfile(req.currentUser!.id);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const input = req.body as PerformanceRecordInput;
    const [record] = await db
      .insert(performanceRecords)
      .values({
        ...recordValues(input),
        profileId: profile.id
      })
      .returning();

    const updatedProfile =
      input.quotaAttainmentPct == null ? profile : await recomputeVerificationTier(profile.id);

    return res.status(201).json({
      record,
      profile: updatedProfile
    });
  })
);

recordsRouter.put(
  "/:id",
  validateParams(recordParamsSchema),
  validateBody(performanceRecordSchema),
  asyncHandler(async (req, res) => {
    const profile = await findOwnProfile(req.currentUser!.id);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const existingRecord = await findOwnRecord(req.params.id, profile);
    if (!existingRecord) {
      return res.status(404).json({ error: "Record not found" });
    }

    const input = req.body as PerformanceRecordInput;
    const [record] = await db
      .update(performanceRecords)
      .set(recordValues(input))
      .where(eq(performanceRecords.id, existingRecord.id))
      .returning();

    const attainmentChanged =
      existingRecord.quotaAttainmentPct !== (input.quotaAttainmentPct ?? null);
    const updatedProfile = attainmentChanged
      ? await recomputeVerificationTier(profile.id)
      : profile;

    return res.status(200).json({
      record,
      profile: updatedProfile
    });
  })
);

recordsRouter.delete(
  "/:id",
  validateParams(recordParamsSchema),
  asyncHandler(async (req, res) => {
    const profile = await findOwnProfile(req.currentUser!.id);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const existingRecord = await findOwnRecord(req.params.id, profile);
    if (!existingRecord) {
      return res.status(404).json({ error: "Record not found" });
    }

    await db.delete(performanceRecords).where(eq(performanceRecords.id, existingRecord.id));

    if (existingRecord.quotaAttainmentPct != null) {
      await recomputeVerificationTier(profile.id);
    }

    return res.status(204).send();
  })
);
