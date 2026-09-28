import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requireEmailVerified, requireRole } from "../middleware/auth";
import { uploadRateLimit } from "../middleware/rateLimit";
import { validateBody, validateParams } from "../middleware/validate";
import { isPdf, processProofImage } from "../services/imageProcessing";
import {
  createPresignedUploadUrl,
  deleteObjects,
  getObjectBuffer,
  putObjectBuffer
} from "../services/r2";
import { recomputeVerificationTier } from "../services/verificationTier";
import { asyncHandler } from "../utils/http";
import { proofItems, repProfiles, type RepProfile } from "../../shared/schema";
import { proofParamsSchema, proofUploadSchema, type ProofUploadInput } from "../../shared/validators";

export const proofsRouter = Router();

proofsRouter.use(asyncHandler(requireAuth), requireEmailVerified, requireRole("rep", "admin"));

const extensionByContentType: Record<ProofUploadInput["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf"
};

const contentTypeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf"
};

function contentTypeForKey(key: string) {
  const extension = key.split(".").pop() ?? "";
  return contentTypeByExtension[extension] ?? "application/octet-stream";
}

async function findOwnProfile(userId: string) {
  return db.query.repProfiles.findFirst({
    where: eq(repProfiles.userId, userId)
  });
}

async function findOwnProof(proofId: string, profile: RepProfile) {
  return db.query.proofItems.findFirst({
    where: and(eq(proofItems.id, proofId), eq(proofItems.profileId, profile.id))
  });
}

proofsRouter.post(
  "/upload-url",
  uploadRateLimit(),
  validateBody(proofUploadSchema),
  asyncHandler(async (req, res) => {
    const profile = await findOwnProfile(req.currentUser!.id);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const input = req.body as ProofUploadInput;
    const extension = extensionByContentType[input.contentType];
    const originalKey = `proofs/${profile.id}/${randomUUID()}-original.${extension}`;

    const [proof] = await db
      .insert(proofItems)
      .values({
        profileId: profile.id,
        type: input.type,
        originalKey
      })
      .returning();

    const uploadUrl = await createPresignedUploadUrl(originalKey, input.contentType, input.sizeBytes);

    return res.status(201).json({ proof, uploadUrl });
  })
);

proofsRouter.post(
  "/:id/complete",
  validateParams(proofParamsSchema),
  asyncHandler(async (req, res) => {
    const profile = await findOwnProfile(req.currentUser!.id);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const existingProof = await findOwnProof(req.params.id, profile);
    if (!existingProof) {
      return res.status(404).json({ error: "Proof not found" });
    }

    if (existingProof.status !== "pending") {
      return res.status(409).json({ error: "Proof has already been reviewed" });
    }

    let uploadedObject: Buffer;
    try {
      uploadedObject = await getObjectBuffer(existingProof.originalKey);
    } catch {
      return res.status(400).json({ error: "Uploaded file not found" });
    }

    let thumbKey = existingProof.thumbKey;

    if (!isPdf(uploadedObject)) {
      const { original, thumb } = await processProofImage(uploadedObject);
      thumbKey = `${existingProof.originalKey.replace(/\.[a-z0-9]+$/i, "")}-thumb.jpg`;

      await putObjectBuffer(existingProof.originalKey, original, contentTypeForKey(existingProof.originalKey));
      await putObjectBuffer(thumbKey, thumb, "image/jpeg");
    }

    const [proof] = await db
      .update(proofItems)
      .set({ thumbKey })
      .where(eq(proofItems.id, existingProof.id))
      .returning();

    return res.status(200).json({ proof });
  })
);

proofsRouter.delete(
  "/:id",
  validateParams(proofParamsSchema),
  asyncHandler(async (req, res) => {
    const profile = await findOwnProfile(req.currentUser!.id);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const existingProof = await findOwnProof(req.params.id, profile);
    if (!existingProof) {
      return res.status(404).json({ error: "Proof not found" });
    }

    await db.delete(proofItems).where(eq(proofItems.id, existingProof.id));
    await deleteObjects([existingProof.originalKey, existingProof.thumbKey, existingProof.redactedKey]);

    if (existingProof.status === "approved") {
      await recomputeVerificationTier(profile.id);
    }

    return res.status(204).send();
  })
);
