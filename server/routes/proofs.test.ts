import bcrypt from "bcrypt";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { events, proofItems, users } from "../../shared/schema";

const { r2Store } = vi.hoisted(() => ({
  r2Store: new Map<string, { body: Buffer; contentType: string }>()
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

async function createVerifiedAgent(email: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({
    email,
    passwordHash,
    emailVerifiedAt: new Date()
  });

  const agent = request.agent(app);
  const loginResponse = await agent.post("/api/auth/login").send({ email, password });
  expect(loginResponse.status).toBe(200);

  return agent;
}

async function createProfile(agent: ReturnType<typeof request.agent>, displayName: string) {
  const response = await agent.put("/api/profile").send({
    ...completeProfilePayload,
    displayName
  });
  expect(response.status).toBe(200);

  return response.body.profile;
}

async function createProof(
  agent: ReturnType<typeof request.agent>,
  payload: Record<string, unknown> = uploadPayload
) {
  const response = await agent.post("/api/proofs/upload-url").send(payload);
  expect(response.status).toBe(201);

  return response.body.proof;
}

async function createJpegWithGpsExif() {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 40, g: 80, b: 160 }
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

describe("proof routes", () => {
  beforeEach(async () => {
    await clearDatabase();
    r2Store.clear();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("creates a pending proof and returns a presigned upload URL", async () => {
    const agent = await createVerifiedAgent("proofs-upload@example.com");
    const profile = await createProfile(agent, "Upload Happy Path");

    const response = await agent.post("/api/proofs/upload-url").send(uploadPayload);
    expect(response.status).toBe(201);
    expect(response.body.proof.status).toBe("pending");
    expect(response.body.proof.type).toBe("leaderboard");
    expect(response.body.proof.originalKey).toMatch(new RegExp(`^proofs/${profile.id}/.+-original\\.jpg$`));
    expect(response.body.uploadUrl).toBe(`https://r2.test/upload/${response.body.proof.originalKey}`);

    const storedProof = await db.query.proofItems.findFirst({
      where: eq(proofItems.id, response.body.proof.id)
    });
    expect(storedProof?.status).toBe("pending");
    expect(storedProof?.thumbKey).toBeNull();
  });

  it("rejects non-image/PDF content types", async () => {
    const agent = await createVerifiedAgent("proofs-bad-mime@example.com");
    await createProfile(agent, "Bad Mime");

    const response = await agent.post("/api/proofs/upload-url").send({
      ...uploadPayload,
      contentType: "text/plain"
    });

    expect(response.status).toBe(400);
    expect(response.body.fields.contentType).toBeTruthy();
  });

  it("rejects uploads larger than 10MB", async () => {
    const agent = await createVerifiedAgent("proofs-too-big@example.com");
    await createProfile(agent, "Too Big");

    const response = await agent.post("/api/proofs/upload-url").send({
      ...uploadPayload,
      sizeBytes: 10 * 1024 * 1024 + 1
    });

    expect(response.status).toBe(400);
    expect(response.body.fields.sizeBytes).toBeTruthy();
  });

  it("requires a profile before issuing upload URLs", async () => {
    const agent = await createVerifiedAgent("proofs-no-profile@example.com");

    const response = await agent.post("/api/proofs/upload-url").send(uploadPayload);
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Profile not found");
  });

  it("strips GPS EXIF and generates a 400px thumbnail on complete", async () => {
    const agent = await createVerifiedAgent("proofs-exif@example.com");
    await createProfile(agent, "Exif Stripper");
    const proof = await createProof(agent);

    const jpegWithGps = await createJpegWithGpsExif();
    const inputMetadata = await sharp(jpegWithGps).metadata();
    expect(inputMetadata.exif).toBeTruthy();

    r2Store.set(proof.originalKey, { body: jpegWithGps, contentType: "image/jpeg" });

    const response = await agent.post(`/api/proofs/${proof.id}/complete`);
    expect(response.status).toBe(200);
    expect(response.body.proof.thumbKey).toMatch(/-thumb\.jpg$/);
    expect(response.body.proof.status).toBe("pending");

    const storedOriginal = r2Store.get(proof.originalKey);
    expect(storedOriginal).toBeTruthy();
    const originalMetadata = await sharp(storedOriginal!.body).metadata();
    expect(originalMetadata.exif).toBeUndefined();
    expect(originalMetadata.width).toBe(800);

    const storedThumb = r2Store.get(response.body.proof.thumbKey);
    expect(storedThumb).toBeTruthy();
    const thumbMetadata = await sharp(storedThumb!.body).metadata();
    expect(thumbMetadata.width).toBe(400);
    expect(thumbMetadata.exif).toBeUndefined();
  });

  it("completes PDF proofs without generating a thumbnail", async () => {
    const agent = await createVerifiedAgent("proofs-pdf@example.com");
    await createProfile(agent, "Pdf Prover");
    const proof = await createProof(agent, {
      ...uploadPayload,
      contentType: "application/pdf"
    });

    const pdfBody = Buffer.from("%PDF-1.4 minimal test document");
    r2Store.set(proof.originalKey, { body: pdfBody, contentType: "application/pdf" });

    const response = await agent.post(`/api/proofs/${proof.id}/complete`);
    expect(response.status).toBe(200);
    expect(response.body.proof.thumbKey).toBeNull();
    expect(r2Store.get(proof.originalKey)?.body.equals(pdfBody)).toBe(true);
  });

  it("returns 400 when completing a proof whose object was never uploaded", async () => {
    const agent = await createVerifiedAgent("proofs-missing-object@example.com");
    await createProfile(agent, "Missing Object");
    const proof = await createProof(agent);

    const response = await agent.post(`/api/proofs/${proof.id}/complete`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Uploaded file not found");
  });

  it("hides pending and rejected proofs on the public page and signs approved assets", async () => {
    const agent = await createVerifiedAgent("proofs-public@example.com");
    const profile = await createProfile(agent, "Public Proofs");
    const publishResponse = await agent.post("/api/profile/publish");
    expect(publishResponse.status).toBe(200);

    const proof = await createProof(agent);

    const pendingView = await request(app).get(`/api/r/${profile.slug}`);
    expect(pendingView.status).toBe(200);
    expect(pendingView.body.proofs).toEqual([]);

    await db.update(proofItems).set({ status: "rejected" }).where(eq(proofItems.id, proof.id));
    const rejectedView = await request(app).get(`/api/r/${profile.slug}`);
    expect(rejectedView.status).toBe(200);
    expect(rejectedView.body.proofs).toEqual([]);

    await db
      .update(proofItems)
      .set({ status: "approved", thumbKey: `${proof.originalKey}-thumb.jpg` })
      .where(eq(proofItems.id, proof.id));
    const approvedView = await request(app).get(`/api/r/${profile.slug}`);
    expect(approvedView.status).toBe(200);
    expect(approvedView.body.proofs).toHaveLength(1);
    expect(approvedView.body.proofs[0].assetUrl).toBe(
      `https://r2.test/signed/${proof.originalKey}?expires=900`
    );
    expect(approvedView.body.proofs[0].thumbUrl).toBe(
      `https://r2.test/signed/${proof.originalKey}-thumb.jpg?expires=900`
    );

    await db
      .update(proofItems)
      .set({ redactedKey: `proofs/${profile.id}/redacted.jpg` })
      .where(eq(proofItems.id, proof.id));
    const redactedView = await request(app).get(`/api/r/${profile.slug}`);
    expect(redactedView.status).toBe(200);
    expect(redactedView.body.proofs[0].assetUrl).toBe(
      `https://r2.test/signed/proofs/${profile.id}/redacted.jpg?expires=900`
    );
    expect(redactedView.body.proofs[0].assetUrl).not.toContain(proof.originalKey);
  });

  it("returns 429 on the 11th upload within an hour, keyed per user", async () => {
    const agent = await createVerifiedAgent("proofs-rate-limit@example.com");
    await createProfile(agent, "Rate Limited");

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await agent.post("/api/proofs/upload-url").send(uploadPayload);
      expect(response.status).toBe(201);
    }

    const eleventh = await agent.post("/api/proofs/upload-url").send(uploadPayload);
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error).toBe("Too many uploads");

    const otherAgent = await createVerifiedAgent("proofs-rate-limit-other@example.com");
    await createProfile(otherAgent, "Other Rate User");
    const otherResponse = await otherAgent.post("/api/proofs/upload-url").send(uploadPayload);
    expect(otherResponse.status).toBe(201);
  });

  it("deletes the proof row and its R2 objects", async () => {
    const agent = await createVerifiedAgent("proofs-delete@example.com");
    await createProfile(agent, "Deleter");
    const proof = await createProof(agent);

    const jpegWithGps = await createJpegWithGpsExif();
    r2Store.set(proof.originalKey, { body: jpegWithGps, contentType: "image/jpeg" });
    const completeResponse = await agent.post(`/api/proofs/${proof.id}/complete`);
    expect(completeResponse.status).toBe(200);
    const thumbKey = completeResponse.body.proof.thumbKey as string;
    expect(r2Store.has(thumbKey)).toBe(true);

    const deleteResponse = await agent.delete(`/api/proofs/${proof.id}`);
    expect(deleteResponse.status).toBe(204);

    const storedProof = await db.query.proofItems.findFirst({
      where: eq(proofItems.id, proof.id)
    });
    expect(storedProof).toBeUndefined();
    expect(r2Store.has(proof.originalKey)).toBe(false);
    expect(r2Store.has(thumbKey)).toBe(false);
  });

  it("prevents a rep from completing or deleting another rep's proofs", async () => {
    const ownerAgent = await createVerifiedAgent("proofs-owner@example.com");
    const intruderAgent = await createVerifiedAgent("proofs-intruder@example.com");
    await createProfile(ownerAgent, "Proof Owner");
    await createProfile(intruderAgent, "Proof Intruder");

    const proof = await createProof(ownerAgent);

    const deniedComplete = await intruderAgent.post(`/api/proofs/${proof.id}/complete`);
    expect(deniedComplete.status).toBe(404);
    expect(deniedComplete.body.error).toBe("Proof not found");

    const deniedDelete = await intruderAgent.delete(`/api/proofs/${proof.id}`);
    expect(deniedDelete.status).toBe(404);
    expect(deniedDelete.body.error).toBe("Proof not found");

    const storedProof = await db.query.proofItems.findFirst({
      where: eq(proofItems.id, proof.id)
    });
    expect(storedProof).toBeTruthy();
  });
});
