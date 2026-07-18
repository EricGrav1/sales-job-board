import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { asc, count, eq } from "drizzle-orm";
import { db } from "../db";
import { requireAdmin } from "../middleware/auth";
import { validateBody, validateParams } from "../middleware/validate";
import { sendProofApprovedEmail, sendProofRejectedEmail } from "../services/email";
import { processProofImage } from "../services/imageProcessing";
import { createSignedGetUrl, putObjectBuffer } from "../services/r2";
import { recomputeVerificationTier } from "../services/verificationTier";
import { asyncHandler } from "../utils/http";
import { proofItems, repProfiles, users } from "../../shared/schema";
import {
  MAX_PROOF_SIZE_BYTES,
  adminProofsQuerySchema,
  proofParamsSchema,
  proofRejectSchema,
  type ProofRejectInput
} from "../../shared/validators";

export const adminRouter = Router();

adminRouter.use(asyncHandler(requireAdmin));

const redactedExtensionByContentType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

const redactedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROOF_SIZE_BYTES, files: 1 }
});

function uploadRedactedImage(req: Request, res: Response, next: NextFunction) {
  redactedUpload.single("redacted")(req, res, (error: unknown) => {
    if (error) {
      return res.status(400).json({ error: "Invalid redacted image upload" });
    }

    return next();
  });
}

async function findProofForReview(proofId: string) {
  return db.query.proofItems.findFirst({
    where: eq(proofItems.id, proofId),
    with: {
      profile: {
        with: {
          user: true
        }
      }
    }
  });
}

adminRouter.get(
  "/proofs",
  asyncHandler(async (req, res) => {
    const parsedQuery = adminProofsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: "Validation failed",
        fields: parsedQuery.error.flatten().fieldErrors
      });
    }

    const proofs = await db.query.proofItems.findMany({
      where: eq(proofItems.status, parsedQuery.data.status),
      orderBy: asc(proofItems.createdAt),
      with: {
        profile: true
      }
    });

    return res.status(200).json({
      proofs: await Promise.all(
        proofs.map(async (proof) => ({
          id: proof.id,
          profileId: proof.profileId,
          performanceRecordId: proof.performanceRecordId,
          type: proof.type,
          status: proof.status,
          rejectionReason: proof.rejectionReason,
          reviewedByUserId: proof.reviewedByUserId,
          reviewedAt: proof.reviewedAt,
          createdAt: proof.createdAt,
          profile: {
            id: proof.profile.id,
            slug: proof.profile.slug,
            displayName: proof.profile.displayName
          },
          originalUrl: await createSignedGetUrl(proof.originalKey),
          redactedUrl: proof.redactedKey ? await createSignedGetUrl(proof.redactedKey) : null,
          thumbUrl: proof.thumbKey ? await createSignedGetUrl(proof.thumbKey) : null
        }))
      )
    });
  })
);

adminRouter.post(
  "/proofs/:id/approve",
  validateParams(proofParamsSchema),
  uploadRedactedImage,
  asyncHandler(async (req, res) => {
    const existingProof = await findProofForReview(req.params.id);
    if (!existingProof) {
      return res.status(404).json({ error: "Proof not found" });
    }

    if (existingProof.status !== "pending") {
      return res.status(409).json({ error: "Proof has already been reviewed" });
    }

    let redactedKey = existingProof.redactedKey;

    if (req.file) {
      const extension = redactedExtensionByContentType[req.file.mimetype];
      if (!extension) {
        return res.status(400).json({ error: "Redacted upload must be an image" });
      }

      const { original } = await processProofImage(req.file.buffer);
      redactedKey = `proofs/${existingProof.profileId}/${randomUUID()}-redacted.${extension}`;
      await putObjectBuffer(redactedKey, original, req.file.mimetype);
    }

    const [proof] = await db
      .update(proofItems)
      .set({
        status: "approved",
        redactedKey,
        rejectionReason: null,
        reviewedByUserId: req.currentUser!.id,
        reviewedAt: new Date()
      })
      .where(eq(proofItems.id, existingProof.id))
      .returning();

    await recomputeVerificationTier(existingProof.profileId);
    await sendProofApprovedEmail(existingProof.profile.user.email);

    return res.status(200).json({ proof });
  })
);

adminRouter.post(
  "/proofs/:id/reject",
  validateParams(proofParamsSchema),
  validateBody(proofRejectSchema),
  asyncHandler(async (req, res) => {
    const existingProof = await findProofForReview(req.params.id);
    if (!existingProof) {
      return res.status(404).json({ error: "Proof not found" });
    }

    if (existingProof.status !== "pending") {
      return res.status(409).json({ error: "Proof has already been reviewed" });
    }

    const { reason } = req.body as ProofRejectInput;

    const [proof] = await db
      .update(proofItems)
      .set({
        status: "rejected",
        rejectionReason: reason,
        reviewedByUserId: req.currentUser!.id,
        reviewedAt: new Date()
      })
      .where(eq(proofItems.id, existingProof.id))
      .returning();

    await recomputeVerificationTier(existingProof.profileId);
    await sendProofRejectedEmail(existingProof.profile.user.email, reason);

    return res.status(200).json({ proof });
  })
);

adminRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [[userCount], [publishedProfileCount], [pendingProofCount]] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(repProfiles).where(eq(repProfiles.isPublished, true)),
      db.select({ count: count() }).from(proofItems).where(eq(proofItems.status, "pending"))
    ]);

    return res.status(200).json({
      stats: {
        users: userCount.count,
        publishedProfiles: publishedProfileCount.count,
        pendingProofs: pendingProofCount.count
      }
    });
  })
);
