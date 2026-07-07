import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requireEmailVerified } from "../middleware/auth";
import { asyncHandler } from "../utils/http";
import { performanceRecords, proofItems, repProfiles } from "../../shared/schema";

export const profileRouter = Router();

profileRouter.use(asyncHandler(requireAuth), requireEmailVerified);

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

profileRouter.put("/", (_req, res) => {
  return res.status(501).json({ error: "Profile CRUD is implemented in M2" });
});

profileRouter.post("/publish", (_req, res) => {
  return res.status(501).json({ error: "Profile publishing is implemented in M2" });
});
