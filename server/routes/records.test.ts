import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { events, performanceRecords, repProfiles, users } from "../../shared/schema";

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

const recordPayload = {
  periodLabel: "Q3 2026",
  quotaAttainmentPct: 128,
  rank: 2,
  teamSize: 18,
  notes: "Finished second on the enterprise pod."
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

describe("record routes", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("creates, updates, reads, and deletes records for the authenticated rep", async () => {
    const agent = await createVerifiedAgent("records-crud@example.com");
    await createProfile(agent, "Avery Records");

    const createResponse = await agent.post("/api/records").send(recordPayload);
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.record.periodLabel).toBe(recordPayload.periodLabel);
    expect(createResponse.body.record.quotaAttainmentPct).toBe(recordPayload.quotaAttainmentPct);
    expect(createResponse.body.profile.verificationTier).toBe("self_reported");

    const updatePayload = {
      periodLabel: "Q4 2026",
      quotaAttainmentPct: 141,
      rank: 1,
      teamSize: 22,
      notes: "Top attainment for the quarter."
    };
    const updateResponse = await agent.put(`/api/records/${createResponse.body.record.id}`).send(updatePayload);
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.record.id).toBe(createResponse.body.record.id);
    expect(updateResponse.body.record.periodLabel).toBe(updatePayload.periodLabel);
    expect(updateResponse.body.record.rank).toBe(1);

    const profileResponse = await agent.get("/api/profile");
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.records).toHaveLength(1);
    expect(profileResponse.body.records[0].id).toBe(createResponse.body.record.id);

    const deleteResponse = await agent.delete(`/api/records/${createResponse.body.record.id}`);
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await agent.get("/api/profile");
    expect(afterDeleteResponse.status).toBe(200);
    expect(afterDeleteResponse.body.records).toEqual([]);
  });

  it.each([
    ["below zero", -1],
    ["above five hundred", 501]
  ])("rejects quota attainment %s", async (_label, quotaAttainmentPct) => {
    const agent = await createVerifiedAgent(`records-invalid-${quotaAttainmentPct}@example.com`);
    await createProfile(agent, `Invalid ${quotaAttainmentPct}`);

    const response = await agent.post("/api/records").send({
      ...recordPayload,
      quotaAttainmentPct
    });

    expect(response.status).toBe(400);
    expect(response.body.fields.quotaAttainmentPct).toBeTruthy();
  });

  it("flips tier on first attainment record and reverts when the last attainment record is deleted", async () => {
    const agent = await createVerifiedAgent("records-tier@example.com");
    await createProfile(agent, "Tier Logic");

    const startingProfile = await agent.get("/api/profile");
    expect(startingProfile.status).toBe(200);
    expect(startingProfile.body.profile.verificationTier).toBe("unverified");

    const createWithoutAttainment = await agent.post("/api/records").send({
      periodLabel: "Q1 2026",
      quotaAttainmentPct: null,
      rank: 4,
      teamSize: 20,
      notes: "Pipeline build quarter."
    });
    expect(createWithoutAttainment.status).toBe(201);
    expect(createWithoutAttainment.body.profile.verificationTier).toBe("unverified");

    const createWithAttainment = await agent.post("/api/records").send({
      ...recordPayload,
      periodLabel: "Q2 2026"
    });
    expect(createWithAttainment.status).toBe(201);
    expect(createWithAttainment.body.profile.verificationTier).toBe("self_reported");

    const deleteResponse = await agent.delete(`/api/records/${createWithAttainment.body.record.id}`);
    expect(deleteResponse.status).toBe(204);

    const finalProfile = await agent.get("/api/profile");
    expect(finalProfile.status).toBe(200);
    expect(finalProfile.body.profile.verificationTier).toBe("unverified");
    expect(finalProfile.body.records).toHaveLength(1);
    expect(finalProfile.body.records[0].quotaAttainmentPct).toBeNull();
  });

  it("prevents a rep from modifying another rep's records", async () => {
    const firstAgent = await createVerifiedAgent("records-owner-one@example.com");
    const secondAgent = await createVerifiedAgent("records-owner-two@example.com");
    await createProfile(firstAgent, "Owner One");
    await createProfile(secondAgent, "Owner Two");

    const createResponse = await firstAgent.post("/api/records").send(recordPayload);
    expect(createResponse.status).toBe(201);

    const deniedUpdate = await secondAgent.put(`/api/records/${createResponse.body.record.id}`).send({
      ...recordPayload,
      periodLabel: "Stolen record"
    });
    expect(deniedUpdate.status).toBe(404);
    expect(deniedUpdate.body.error).toBe("Record not found");

    const deniedDelete = await secondAgent.delete(`/api/records/${createResponse.body.record.id}`);
    expect(deniedDelete.status).toBe(404);
    expect(deniedDelete.body.error).toBe("Record not found");

    const ownerProfile = await firstAgent.get("/api/profile");
    expect(ownerProfile.status).toBe(200);
    expect(ownerProfile.body.records).toHaveLength(1);
    expect(ownerProfile.body.records[0].periodLabel).toBe(recordPayload.periodLabel);
  });

  it("returns public profile records sorted by createdAt descending", async () => {
    const agent = await createVerifiedAgent("records-public-order@example.com");
    const profile = await createProfile(agent, "Public Ordering");

    const olderRecord = await agent.post("/api/records").send({
      ...recordPayload,
      periodLabel: "Older quarter"
    });
    expect(olderRecord.status).toBe(201);

    const newerRecord = await agent.post("/api/records").send({
      ...recordPayload,
      periodLabel: "Newer quarter"
    });
    expect(newerRecord.status).toBe(201);

    await db
      .update(performanceRecords)
      .set({ createdAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(performanceRecords.id, olderRecord.body.record.id));
    await db
      .update(performanceRecords)
      .set({ createdAt: new Date("2026-02-01T00:00:00.000Z") })
      .where(eq(performanceRecords.id, newerRecord.body.record.id));

    const publishResponse = await agent.post("/api/profile/publish");
    expect(publishResponse.status).toBe(200);

    const publicResponse = await request(app).get(`/api/r/${profile.slug}`);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.records.map((record: { id: string }) => record.id)).toEqual([
      newerRecord.body.record.id,
      olderRecord.body.record.id
    ]);

    const [storedProfile] = await db.select().from(repProfiles).where(eq(repProfiles.id, profile.id));
    expect(storedProfile.verificationTier).toBe("self_reported");
  });
});
