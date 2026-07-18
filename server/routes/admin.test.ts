import bcrypt from "bcrypt";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { events, proofItems, repProfiles, users } from "../../shared/schema";

const { r2Store } = vi.hoisted(() => ({
  r2Store: new Map<string, { body: Buffer; contentType: string }>()
}));

const { emailMocks } = vi.hoisted(() => ({
  emailMocks: {
    sendVerificationEmail: vi.fn(async () => ({ mode: "logged" as const, verificationUrl: "" })),
    sendProofApprovedEmail: vi.fn(async () => ({ mode: "logged" as const })),
    sendProofRejectedEmail: vi.fn(async () => ({ mode: "logged" as const }))
  }
}));

vi.mock("../services/r2", () => ({
  SIGNED_URL_EXPIRES_IN_SECONDS: 15 * 60,
  createR2Client: vi.fn(() => {
    throw new Error("Real R2 client must not be used in tests");
  }),
  createPresignedUploadUrl: vi.fn(async (key: string) => `https://r2.test/upload/${key}`),
  createSignedGetUrl: vi.fn(async (key: string) => `https://r2.test/signed/${key}?expires=900`),
  getObjectBuffer: vi.fn(async (key: string) => {
    const object = r2Store.get(key);
    if (!object) {
      throw new Error(`NoSuchKey: ${key}`);
    }

    return object.body;
  }),
  putObjectBuffer: vi.fn(async (key: string, body: Buffer, contentType: string) => {
    r2Store.set(key, { body, contentType });
  }),
  deleteObjects: vi.fn(async (keys: Array<string | null | undefined>) => {
    for (const key of keys) {
      if (key) {
        r2Store.delete(key);
      }
    }
  })
}));

vi.mock("../services/email", () => emailMocks);

const app = createApp();
const password = "correct-password";

const completeProfilePayload = {
  displayName: "Morgan Lee",
  headline: "Enterprise AE with repeatable quota wins",
  bio: "Builds durable pipeline and closes complex SaaS deals.",
  roleType: "ae",
  industries: ["SaaS", "Fintech"],
  yearsExperience: 7,
  oteMin: 180000,
  oteMax: 250000,
  location: "New York, NY",
  remoteOk: true
};

const uploadPayload = {
  type: "leaderboard",
  contentType: "image/jpeg",
  sizeBytes: 1024 * 1024
};

async function clearDatabase() {
  await db.delete(events);
  await db.delete(users);
}

async function createVerifiedAgent(email: string, role: "rep" | "admin" = "rep") {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({
    email,
    passwordHash,
    role,
    emailVerifiedAt: new Date()
  });

  const agent = request.agent(app);
  const loginResponse = await agent.post("/api/auth/login").send({ email, password });
  expect(loginResponse.status).toBe(200);

  return agent;
}

async function createAdminAgent(email: string) {
  return createVerifiedAgent(email, "admin");
}

async function createProfile(agent: ReturnType<typeof request.agent>, displayName: string) {
  const response = await agent.put("/api/profile").send({
    ...completeProfilePayload,
    displayName
  });
  expect(response.status).toBe(200);

  return response.body.profile;
}

async function createProof(agent: ReturnType<typeof request.agent>) {
  const response = await agent.post("/api/proofs/upload-url").send(uploadPayload);
  expect(response.status).toBe(201);

  return response.body.proof;
}

async function createPublishedRepWithProof(email: string, displayName: string) {
  const agent = await createVerifiedAgent(email);
  const profile = await createProfile(agent, displayName);
  const publishResponse = await agent.post("/api/profile/publish");
  expect(publishResponse.status).toBe(200);
  const proof = await createProof(agent);

  return { agent, profile, proof };
}

async function createJpegWithGpsExif() {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 200, g: 60, b: 60 }
    }
  })
    .jpeg()
    .withExif({
      IFD0: {
        Copyright: "Sales Job Board Test"
      },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 3230/100",
        GPSLongitudeRef: "W",
        GPSLongitude: "0/1 7/1 4366/100"
      }
    })
    .toBuffer();
}

describe("admin routes", () => {
  beforeEach(async () => {
    await clearDatabase();
    r2Store.clear();
    emailMocks.sendVerificationEmail.mockClear();
    emailMocks.sendProofApprovedEmail.mockClear();
    emailMocks.sendProofRejectedEmail.mockClear();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("returns 403 for unauthenticated and non-admin users on all admin routes", async () => {
    const repAgent = await createVerifiedAgent("admin-403-rep@example.com");
    await createProfile(repAgent, "Rep Not Admin");
    const proof = await createProof(repAgent);

    const anonymousQueue = await request(app).get("/api/admin/proofs");
    expect(anonymousQueue.status).toBe(403);
    expect(anonymousQueue.body.error).toBe("Admin access required");

    const repQueue = await repAgent.get("/api/admin/proofs");
    expect(repQueue.status).toBe(403);

    const repApprove = await repAgent.post(`/api/admin/proofs/${proof.id}/approve`);
    expect(repApprove.status).toBe(403);

    const repReject = await repAgent
      .post(`/api/admin/proofs/${proof.id}/reject`)
      .send({ reason: "not allowed" });
    expect(repReject.status).toBe(403);

    const repStats = await repAgent.get("/api/admin/stats");
    expect(repStats.status).toBe(403);

    const storedProof = await db.query.proofItems.findFirst({
      where: eq(proofItems.id, proof.id)
    });
    expect(storedProof?.status).toBe("pending");
  });

  it("lists pending proofs oldest-first with signed original URLs", async () => {
    const { proof: newerProof, profile } = await createPublishedRepWithProof(
      "admin-queue-rep@example.com",
      "Queue Rep"
    );
    const { proof: olderProof } = await createPublishedRepWithProof(
      "admin-queue-rep-two@example.com",
      "Queue Rep Two"
    );

    await db
      .update(proofItems)
      .set({ createdAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(proofItems.id, olderProof.id));

    const adminAgent = await createAdminAgent("admin-queue@example.com");
    const response = await adminAgent.get("/api/admin/proofs?status=pending");

    expect(response.status).toBe(200);
    expect(response.body.proofs).toHaveLength(2);
    expect(response.body.proofs.map((proof: { id: string }) => proof.id)).toEqual([
      olderProof.id,
      newerProof.id
    ]);
    expect(response.body.proofs[1].originalUrl).toBe(
      `https://r2.test/signed/${newerProof.originalKey}?expires=900`
    );
    expect(response.body.proofs[1].profile).toEqual({
      id: profile.id,
      slug: profile.slug,
      displayName: profile.displayName
    });

    const defaultResponse = await adminAgent.get("/api/admin/proofs");
    expect(defaultResponse.status).toBe(200);
    expect(defaultResponse.body.proofs).toHaveLength(2);
  });

  it("filters the queue by status and rejects invalid status values", async () => {
    const { proof } = await createPublishedRepWithProof(
      "admin-filter-rep@example.com",
      "Filter Rep"
    );
    await db.update(proofItems).set({ status: "approved" }).where(eq(proofItems.id, proof.id));

    const adminAgent = await createAdminAgent("admin-filter@example.com");

    const pendingResponse = await adminAgent.get("/api/admin/proofs?status=pending");
    expect(pendingResponse.status).toBe(200);
    expect(pendingResponse.body.proofs).toEqual([]);

    const approvedResponse = await adminAgent.get("/api/admin/proofs?status=approved");
    expect(approvedResponse.status).toBe(200);
    expect(approvedResponse.body.proofs).toHaveLength(1);
    expect(approvedResponse.body.proofs[0].id).toBe(proof.id);

    const invalidResponse = await adminAgent.get("/api/admin/proofs?status=bogus");
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.fields.status).toBeTruthy();
  });

  it("approves a proof, flips the tier to verified, emails the rep, and shows it publicly", async () => {
    const { profile, proof } = await createPublishedRepWithProof(
      "admin-approve-rep@example.com",
      "Approve Rep"
    );
    const adminAgent = await createAdminAgent("admin-approve@example.com");
    const adminUser = await db.query.users.findFirst({
      where: eq(users.email, "admin-approve@example.com")
    });

    const response = await adminAgent.post(`/api/admin/proofs/${proof.id}/approve`);
    expect(response.status).toBe(200);
    expect(response.body.proof.status).toBe("approved");
    expect(response.body.proof.reviewedByUserId).toBe(adminUser!.id);
    expect(response.body.proof.reviewedAt).toBeTruthy();
    expect(response.body.proof.redactedKey).toBeNull();

    const storedProfile = await db.query.repProfiles.findFirst({
      where: eq(repProfiles.id, profile.id)
    });
    expect(storedProfile?.verificationTier).toBe("verified");

    expect(emailMocks.sendProofApprovedEmail).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendProofApprovedEmail).toHaveBeenCalledWith("admin-approve-rep@example.com");

    const publicView = await request(app).get(`/api/r/${profile.slug}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.profile.verificationTier).toBe("verified");
    expect(publicView.body.proofs).toHaveLength(1);
    expect(publicView.body.proofs[0].assetUrl).toBe(
      `https://r2.test/signed/${proof.originalKey}?expires=900`
    );

    const secondReview = await adminAgent.post(`/api/admin/proofs/${proof.id}/approve`);
    expect(secondReview.status).toBe(409);
  });

  it("stores an EXIF-stripped redacted upload and serves it publicly instead of the original", async () => {
    const { profile, proof } = await createPublishedRepWithProof(
      "admin-redact-rep@example.com",
      "Redact Rep"
    );
    const adminAgent = await createAdminAgent("admin-redact@example.com");

    const redactedJpeg = await createJpegWithGpsExif();
    const inputMetadata = await sharp(redactedJpeg).metadata();
    expect(inputMetadata.exif).toBeTruthy();

    const response = await adminAgent
      .post(`/api/admin/proofs/${proof.id}/approve`)
      .attach("redacted", redactedJpeg, { filename: "redacted.jpg", contentType: "image/jpeg" });

    expect(response.status).toBe(200);
    expect(response.body.proof.status).toBe("approved");
    expect(response.body.proof.redactedKey).toMatch(
      new RegExp(`^proofs/${profile.id}/.+-redacted\\.jpg$`)
    );

    const storedRedacted = r2Store.get(response.body.proof.redactedKey);
    expect(storedRedacted).toBeTruthy();
    const redactedMetadata = await sharp(storedRedacted!.body).metadata();
    expect(redactedMetadata.exif).toBeUndefined();

    const publicView = await request(app).get(`/api/r/${profile.slug}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.proofs).toHaveLength(1);
    expect(publicView.body.proofs[0].assetUrl).toBe(
      `https://r2.test/signed/${response.body.proof.redactedKey}?expires=900`
    );
    expect(publicView.body.proofs[0].assetUrl).not.toContain(proof.originalKey);
  });

  it("rejects a proof with a reason, emails the rep, and keeps it off the public page", async () => {
    const { profile, proof } = await createPublishedRepWithProof(
      "admin-reject-rep@example.com",
      "Reject Rep"
    );
    const adminAgent = await createAdminAgent("admin-reject@example.com");
    const adminUser = await db.query.users.findFirst({
      where: eq(users.email, "admin-reject@example.com")
    });

    const missingReason = await adminAgent.post(`/api/admin/proofs/${proof.id}/reject`).send({});
    expect(missingReason.status).toBe(400);
    expect(missingReason.body.fields.reason).toBeTruthy();

    const response = await adminAgent
      .post(`/api/admin/proofs/${proof.id}/reject`)
      .send({ reason: "Screenshot is cropped and unreadable" });

    expect(response.status).toBe(200);
    expect(response.body.proof.status).toBe("rejected");
    expect(response.body.proof.rejectionReason).toBe("Screenshot is cropped and unreadable");
    expect(response.body.proof.reviewedByUserId).toBe(adminUser!.id);
    expect(response.body.proof.reviewedAt).toBeTruthy();

    expect(emailMocks.sendProofRejectedEmail).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendProofRejectedEmail).toHaveBeenCalledWith(
      "admin-reject-rep@example.com",
      "Screenshot is cropped and unreadable"
    );

    const storedProfile = await db.query.repProfiles.findFirst({
      where: eq(repProfiles.id, profile.id)
    });
    expect(storedProfile?.verificationTier).toBe("unverified");

    const publicView = await request(app).get(`/api/r/${profile.slug}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.proofs).toEqual([]);

    const secondReview = await adminAgent
      .post(`/api/admin/proofs/${proof.id}/reject`)
      .send({ reason: "Already reviewed" });
    expect(secondReview.status).toBe(409);
  });

  it("returns 404 when reviewing a proof that does not exist", async () => {
    const adminAgent = await createAdminAgent("admin-missing@example.com");

    const approveResponse = await adminAgent.post(
      "/api/admin/proofs/00000000-0000-0000-0000-000000000000/approve"
    );
    expect(approveResponse.status).toBe(404);
    expect(approveResponse.body.error).toBe("Proof not found");

    const rejectResponse = await adminAgent
      .post("/api/admin/proofs/00000000-0000-0000-0000-000000000000/reject")
      .send({ reason: "missing" });
    expect(rejectResponse.status).toBe(404);
    expect(rejectResponse.body.error).toBe("Proof not found");
  });

  it("reports user, published profile, and pending proof counts", async () => {
    const { proof } = await createPublishedRepWithProof("admin-stats-rep@example.com", "Stats Rep");
    const unpublishedAgent = await createVerifiedAgent("admin-stats-unpublished@example.com");
    await createProfile(unpublishedAgent, "Stats Unpublished");
    const adminAgent = await createAdminAgent("admin-stats@example.com");

    await db.update(proofItems).set({ status: "approved" }).where(eq(proofItems.id, proof.id));
    const publishedAgent = await createVerifiedAgent("admin-stats-pending@example.com");
    await createProfile(publishedAgent, "Stats Pending Rep");
    await publishedAgent.post("/api/profile/publish");
    await createProof(publishedAgent);

    const response = await adminAgent.get("/api/admin/stats");
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({
      users: 4,
      publishedProfiles: 2,
      pendingProofs: 1
    });
  });
});
