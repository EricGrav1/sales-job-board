import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { asyncHandler } from "../utils/http";
import { events, performanceRecords, proofItems, repProfiles, type RepProfile } from "../../shared/schema";

export const publicProfileRouter = Router();

function publicProfile(profile: RepProfile) {
  return {
    id: profile.id,
    slug: profile.slug,
    displayName: profile.displayName,
    headline: profile.headline,
    bio: profile.bio,
    roleType: profile.roleType,
    industries: profile.industries,
    yearsExperience: profile.yearsExperience,
    oteMin: profile.oteMin,
    oteMax: profile.oteMax,
    location: profile.location,
    remoteOk: profile.remoteOk,
    verificationTier: profile.verificationTier,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

publicProfileRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const profile = await db.query.repProfiles.findFirst({
      where: and(eq(repProfiles.slug, req.params.slug), eq(repProfiles.isPublished, true))
    });

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const [records, proofs] = await Promise.all([
      db.query.performanceRecords.findMany({
        where: eq(performanceRecords.profileId, profile.id),
        orderBy: desc(performanceRecords.createdAt)
      }),
      db.query.proofItems.findMany({
        where: and(eq(proofItems.profileId, profile.id), eq(proofItems.status, "approved")),
        orderBy: desc(proofItems.createdAt)
      })
    ]);

    await db.insert(events).values({
      type: "profile_view",
      targetId: profile.id
    });

    return res.status(200).json({
      profile: publicProfile(profile),
      records: records.map((record) => ({
        id: record.id,
        periodLabel: record.periodLabel,
        quotaAttainmentPct: record.quotaAttainmentPct,
        rank: record.rank,
        teamSize: record.teamSize,
        notes: record.notes,
        createdAt: record.createdAt
      })),
      proofs: proofs.map((proof) => ({
        id: proof.id,
        type: proof.type,
        status: proof.status,
        createdAt: proof.createdAt,
        assetUrl: null,
        thumbUrl: null
      }))
    });
  })
);
