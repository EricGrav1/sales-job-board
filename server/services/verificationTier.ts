import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { performanceRecords, proofItems, repProfiles } from "../../shared/schema";

export async function recomputeVerificationTier(profileId: string) {
  const approvedProof = await db.query.proofItems.findFirst({
    where: and(eq(proofItems.profileId, profileId), eq(proofItems.status, "approved"))
  });

  const attainmentRecord = approvedProof
    ? null
    : await db.query.performanceRecords.findFirst({
        where: and(
          eq(performanceRecords.profileId, profileId),
          isNotNull(performanceRecords.quotaAttainmentPct)
        )
      });

  const verificationTier = approvedProof ? "verified" : attainmentRecord ? "self_reported" : "unverified";

  const [profile] = await db
    .update(repProfiles)
    .set({
      verificationTier,
      updatedAt: new Date()
    })
    .where(eq(repProfiles.id, profileId))
    .returning();

  return profile;
}
