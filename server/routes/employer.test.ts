import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { companyMembers, users } from "../../shared/schema";
import { clearDatabase, createEmployerWithCompany, createVerifiedAgent } from "../test/helpers";

const app = createApp();

describe("employer accounts + companies (M7)", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("registers employers with role employer and keeps rep as the default", async () => {
    const employerResponse = await request(app)
      .post("/api/auth/register")
      .send({ email: "hiring@acme.test", password: "password123", accountType: "employer" });
    expect(employerResponse.status).toBe(201);
    expect(employerResponse.body.user.role).toBe("employer");

    const seekerResponse = await request(app)
      .post("/api/auth/register")
      .send({ email: "seeker@example.com", password: "password123" });
    expect(seekerResponse.status).toBe(201);
    expect(seekerResponse.body.user.role).toBe("rep");

    const invalidResponse = await request(app)
      .post("/api/auth/register")
      .send({ email: "bad@example.com", password: "password123", accountType: "admin" });
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.fields.accountType).toBeDefined();
  });

  it("creates, reads and updates the employer's company; a second create is 409", async () => {
    const agent = await createVerifiedAgent(app, "owner@acme.test", "employer");

    const emptyResponse = await agent.get("/api/employer/company");
    expect(emptyResponse.status).toBe(200);
    expect(emptyResponse.body.company).toBeNull();

    const createResponse = await agent.post("/api/employer/company").send({
      name: "Acme Revenue",
      website: "https://acme.test",
      description: "We sell anvils to roadrunner hunters.",
      sizeBand: "51-200"
    });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.company).toMatchObject({
      name: "Acme Revenue",
      slug: "acme-revenue",
      plan: "free",
      creditBalanceCents: 0
    });

    const membership = await db.query.companyMembers.findFirst({
      where: eq(companyMembers.companyId, createResponse.body.company.id)
    });
    expect(membership?.role).toBe("owner");

    const duplicateResponse = await agent.post("/api/employer/company").send({ name: "Acme Two" });
    expect(duplicateResponse.status).toBe(409);

    const updateResponse = await agent.put("/api/employer/company").send({ name: "Acme Sales Co" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.company.slug).toBe("acme-sales-co");
    expect(updateResponse.body.company.website).toBeNull();

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.body.company.name).toBe("Acme Sales Co");
  });

  it("dedupes company slugs and requires https websites", async () => {
    await createEmployerWithCompany(app, "one@acme.test", "Acme Revenue");
    const { company } = await createEmployerWithCompany(app, "two@acme.test", "Acme Revenue");
    expect(company.slug).toBe("acme-revenue-2");

    const agent = await createVerifiedAgent(app, "three@acme.test", "employer");
    const response = await agent.post("/api/employer/company").send({ name: "Insecure", website: "http://insecure.test" });
    expect(response.status).toBe(400);
    expect(response.body.fields.website).toBeDefined();
  });

  it("gates routes by account type", async () => {
    const employer = await createVerifiedAgent(app, "boss@acme.test", "employer");
    for (const path of ["/api/profile", "/api/proofs/upload-url", "/api/records"]) {
      const response = path === "/api/profile" ? await employer.get(path) : await employer.post(path).send({});
      expect(response.status, path).toBe(403);
    }

    const rep = await createVerifiedAgent(app, "rep@example.com", "rep");
    const repResponse = await rep.get("/api/employer/company");
    expect(repResponse.status).toBe(403);

    const anonymousResponse = await request(app).get("/api/employer/company");
    expect(anonymousResponse.status).toBe(401);
  });

  it("blocks unverified employers", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "unverified@acme.test", password: "password123", accountType: "employer" });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "unverified@acme.test", password: "password123" });

    const response = await agent.post("/api/employer/company").send({ name: "Nope" });
    expect(response.status).toBe(403);

    const user = await db.query.users.findFirst({ where: eq(users.email, "unverified@acme.test") });
    expect(user?.role).toBe("employer");
  });
});
