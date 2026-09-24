import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requireEmailVerified, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { asyncHandler } from "../utils/http";
import { performanceRecords, proofItems, repProfiles, type RepProfile } from "../../shared/schema";
import { profileUpsertSchema, type ProfileUpsertInput } from "../../shared/validators";

export const profileRouter = Router();

profileRouter.use(asyncHandler(requireAuth), requireEmailVerified, requireRole("rep", "admin"));

function slugifyDisplayName(displayName: string) {
  const slug = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "rep";
}

async function findAvailableSlug(baseSlug: string, currentProfileId?: string) {
  let suffix = 1;

  while (true) {
    const candidate = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const existingProfile = await db.query.repProfiles.findFirst({
      where: eq(repProfiles.slug, candidate)
    });

    if (!existingProfile || existingProfile.id === currentProfileId) {
      return candidate;
    }

    suffix += 1;
  }
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function publishBlockers(profile: RepProfile | null) {
  const reasons: Record<string, string> = {};

  if (!optionalText(profile?.displayName)) {
    reasons.displayName = "Display name is required";
  }

  if (!optionalText(profile?.headline)) {
    reasons.headline = "Headline is required";
  }

  if (!profile?.roleType) {
    reasons.roleType = "Role type is required";
  }

  if (!optionalText(profile?.location)) {
    reasons.location = "Location is required";
  }

  return reasons;
}

function profileValues(input: ProfileUpsertInput, slug: string) {
  return {
    slug,
    displayName: input.displayName,
    headline: optionalText(input.headline),
    bio: optionalText(input.bio),
    roleType: input.roleType ?? null,
    industries: input.industries,
    yearsExperience: input.yearsExperience ?? null,
    oteMin: input.oteMin ?? null,
    oteMax: input.oteMax ?? null,
    location: optionalText(input.location),
    remoteOk: input.remoteOk,
    updatedAt: new Date()
  };
}

profileRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const profile = await db.query.repProfiles.findFirst({
      where: eq(repProfiles.userId, req.currentUser!.id)
    });

    if (!profile) {
      return res.status(200).json({ profile: null, records: [], proofs: [] });
    }

    const [records, proofs] = await Promise.all([
      db.query.performanceRecords.findMany({
        where: eq(performanceRecords.profileId, profile.id),
        orderBy: desc(performanceRecords.createdAt)
      }),
      db.query.proofItems.findMany({
        where: eq(proofItems.profileId, profile.id),
        orderBy: desc(proofItems.createdAt)
      })
    ]);

    return res.status(200).json({ profile, records, proofs });
  })
);

profileRouter.put(
  "/",
  validateBody(profileUpsertSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as ProfileUpsertInput;
    const existingProfile = await db.query.repProfiles.findFirst({
      where: eq(repProfiles.userId, req.currentUser!.id)
    });
    const slug = await findAvailableSlug(slugifyDisplayName(input.displayName), existingProfile?.id);
    const values = profileValues(input, slug);

    const [profile] = existingProfile
      ? await db.update(repProfiles).set(values).where(eq(repProfiles.id, existingProfile.id)).returning()
      : await db
          .insert(repProfiles)
          .values({
            ...values,
            userId: req.currentUser!.id
          })
          .returning();

    return res.status(200).json({ profile });
  })
);

profileRouter.post(
  "/publish",
  asyncHandler(async (req, res) => {
    const existingProfile = await db.query.repProfiles.findFirst({
      where: eq(repProfiles.userId, req.currentUser!.id)
    });
    const reasons = publishBlockers(existingProfile ?? null);

    if (Object.keys(reasons).length > 0) {
      return res.status(422).json({
        error: "Profile is missing required fields",
        reasons
      });
    }

    const [profile] = await db
      .update(repProfiles)
      .set({
        isPublished: true,
        updatedAt: new Date()
      })
      .where(eq(repProfiles.id, existingProfile!.id))
      .returning();

    return res.status(200).json({ profile });
  })
);
