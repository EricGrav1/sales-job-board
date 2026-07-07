import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { events, users } from "../../shared/schema";

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

const invalidProfileCases: Array<[string, Record<string, unknown>, string]> = [
  ["bio longer than 2000 chars", { bio: "a".repeat(2001) }, "bio"],
  [
    "more than 5 industries",
    { industries: ["SaaS", "Fintech", "Healthcare", "Retail", "Manufacturing", "Media"] },
    "industries"
  ],
  ["oteMin greater than oteMax", { oteMin: 300000, oteMax: 200000 }, "oteMin"]
];

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

describe("profile routes", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("upserts the authenticated rep profile", async () => {
    const agent = await createVerifiedAgent("profile-upsert@example.com");

    const emptyProfileResponse = await agent.get("/api/profile");
    expect(emptyProfileResponse.status).toBe(200);
    expect(emptyProfileResponse.body.profile).toBeNull();

    const createResponse = await agent.put("/api/profile").send({
      ...completeProfilePayload,
      displayName: "Avery Brooks"
    });
    expect(createResponse.status).toBe(200);
    expect(createResponse.body.profile.slug).toBe("avery-brooks");
    expect(createResponse.body.profile.headline).toBe(completeProfilePayload.headline);

    const profileId = createResponse.body.profile.id;
    const updateResponse = await agent.put("/api/profile").send({
      ...completeProfilePayload,
      displayName: "Avery Brooks",
      headline: "Strategic AE for complex buying committees",
      industries: ["SaaS"]
    });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.profile.id).toBe(profileId);
    expect(updateResponse.body.profile.slug).toBe("avery-brooks");
    expect(updateResponse.body.profile.headline).toBe("Strategic AE for complex buying committees");
    expect(updateResponse.body.profile.industries).toEqual(["SaaS"]);

    const getResponse = await agent.get("/api/profile");
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.profile.id).toBe(profileId);
    expect(getResponse.body.records).toEqual([]);
    expect(getResponse.body.proofs).toEqual([]);
  });

  it("blocks publish with 422 reasons, then publishes when required fields are present", async () => {
    const agent = await createVerifiedAgent("profile-publish@example.com");

    const draftResponse = await agent.put("/api/profile").send({
      displayName: "Jordan Lane"
    });
    expect(draftResponse.status).toBe(200);

    const blockedResponse = await agent.post("/api/profile/publish");
    expect(blockedResponse.status).toBe(422);
    expect(blockedResponse.body.reasons).toEqual({
      headline: "Headline is required",
      roleType: "Role type is required",
      location: "Location is required"
    });

    const completeResponse = await agent.put("/api/profile").send({
      ...completeProfilePayload,
      displayName: "Jordan Lane"
    });
    expect(completeResponse.status).toBe(200);

    const publishResponse = await agent.post("/api/profile/publish");
    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.profile.isPublished).toBe(true);

    const publicResponse = await request(app).get("/api/r/jordan-lane");
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.profile.displayName).toBe("Jordan Lane");

    const viewEvents = await db
      .select()
      .from(events)
      .where(and(eq(events.type, "profile_view"), eq(events.targetId, publishResponse.body.profile.id)));
    expect(viewEvents).toHaveLength(1);
  });

  it("dedupes slugs with a numeric suffix", async () => {
    const firstAgent = await createVerifiedAgent("slug-one@example.com");
    const secondAgent = await createVerifiedAgent("slug-two@example.com");

    const firstResponse = await firstAgent.put("/api/profile").send({
      ...completeProfilePayload,
      displayName: "Taylor Reed"
    });
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.profile.slug).toBe("taylor-reed");

    const secondResponse = await secondAgent.put("/api/profile").send({
      ...completeProfilePayload,
      displayName: "Taylor Reed"
    });
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.profile.slug).toBe("taylor-reed-2");
  });

  it("returns 404 for unpublished public profiles", async () => {
    const agent = await createVerifiedAgent("unpublished-public@example.com");

    const createResponse = await agent.put("/api/profile").send({
      ...completeProfilePayload,
      displayName: "Casey Park"
    });
    expect(createResponse.status).toBe(200);

    const publicResponse = await request(app).get("/api/r/casey-park");
    expect(publicResponse.status).toBe(404);
    expect(publicResponse.body.error).toBe("Profile not found");

    const viewEvents = await db
      .select()
      .from(events)
      .where(and(eq(events.type, "profile_view"), eq(events.targetId, createResponse.body.profile.id)));
    expect(viewEvents).toHaveLength(0);
  });

  it.each(invalidProfileCases)("rejects profile validation for %s", async (_label, invalidFields, fieldName) => {
    const agent = await createVerifiedAgent(`invalid-${fieldName.toLowerCase()}@example.com`);

    const response = await agent.put("/api/profile").send({
      ...completeProfilePayload,
      ...invalidFields
    });

    expect(response.status).toBe(400);
    expect(response.body.fields[fieldName]).toBeTruthy();
  });
});
