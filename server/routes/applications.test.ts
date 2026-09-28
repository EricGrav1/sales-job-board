import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { applications, events, repProfiles, users } from "../../shared/schema";
import { clearDatabase, createEmployerWithCompany, createPublishedJob, createVerifiedAgent } from "../test/helpers";

vi.mock("../services/r2", () => ({
  SIGNED_URL_EXPIRES_IN_SECONDS: 15 * 60,
  createR2Client: vi.fn(() => {
    throw new Error("Real R2 client must not be used in tests");
  }),
  createPresignedUploadUrl: vi.fn(async (key: string) => `https://r2.test/upload/${key}`),
  createSignedGetUrl: vi.fn(async (key: string) => `https://r2.test/signed/${key}?expires=900`),
  getObjectBuffer: vi.fn(),
  putObjectBuffer: vi.fn(),
  deleteObjects: vi.fn()
}));

const app = createApp();

const applyPayload = {
  fullName: "Jordan Rivera",
  phone: "+1 512 555 0100",
  linkedinUrl: "https://www.linkedin.com/in/jordan-rivera",
  coverNote: "Closed 132% of quota last year selling into mid-market ops teams."
};

async function setup() {
  const { agent: employer, company } = await createEmployerWithCompany(app, "hiring@acme.test");
  const job = await createPublishedJob(employer);
  const seeker = await createVerifiedAgent(app, "jordan@example.com", "rep");
  return { employer, company, job, seeker };
}

async function uploadResume(seeker: ReturnType<typeof request.agent>) {
  const response = await seeker
    .post("/api/applications/resume-upload-url")
    .send({ contentType: "application/pdf", sizeBytes: 200_000 });
  expect(response.status).toBe(200);
  return response.body as { uploadUrl: string; resumeKey: string };
}

describe("applications (M9)", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("lets a seeker apply once, logs job_apply, and returns 409 on a repeat", async () => {
    const { job, seeker } = await setup();
    const { resumeKey } = await uploadResume(seeker);

    const first = await seeker.post(`/api/jobs/${job.slug}/apply`).send({ ...applyPayload, resumeKey });
    expect(first.status).toBe(201);
    expect(first.body.application.status).toBe("new");

    const repeat = await seeker.post(`/api/jobs/${job.slug}/apply`).send(applyPayload);
    expect(repeat.status).toBe(409);

    const event = await db.query.events.findFirst({ where: and(eq(events.type, "job_apply"), eq(events.targetId, job.id)) });
    expect(event).toBeDefined();
  });

  it("rejects applying to external-apply, closed, or missing jobs and requires a seeker account", async () => {
    const { employer, job, seeker } = await setup();

    const external = await employer.post("/api/employer/jobs").send({
      title: "External AE",
      category: "account_executive",
      level: "mid",
      employmentType: "full_time",
      workplace: "remote",
      location: "Remote",
      compType: "salary_only",
      baseMin: 70000,
      baseMax: 90000,
      description: "z".repeat(120),
      applyMethod: "external",
      applyUrl: "https://careers.acme.test/ae"
    });
    await employer.post(`/api/employer/jobs/${job.id}/close`);
    await employer.post(`/api/employer/jobs/${external.body.job.id}/publish`);

    expect((await seeker.post(`/api/jobs/${external.body.job.slug}/apply`).send(applyPayload)).status).toBe(422);
    expect((await seeker.post(`/api/jobs/${job.slug}/apply`).send(applyPayload)).status).toBe(404);
    expect((await seeker.post("/api/jobs/nope/apply").send(applyPayload)).status).toBe(404);

    expect((await employer.post(`/api/jobs/${external.body.job.slug}/apply`).send(applyPayload)).status).toBe(403);
    expect((await request(app).post(`/api/jobs/${external.body.job.slug}/apply`).send(applyPayload)).status).toBe(401);
  });

  it("validates resume uploads and resume ownership", async () => {
    const { job, seeker } = await setup();

    const wrongType = await seeker.post("/api/applications/resume-upload-url").send({ contentType: "image/png", sizeBytes: 1000 });
    expect(wrongType.status).toBe(400);
    const tooBig = await seeker
      .post("/api/applications/resume-upload-url")
      .send({ contentType: "application/pdf", sizeBytes: 5 * 1024 * 1024 + 1 });
    expect(tooBig.status).toBe(400);

    const other = await createVerifiedAgent(app, "other-seeker@example.com", "rep");
    const { resumeKey: othersKey } = await uploadResume(other);
    const stolen = await seeker.post(`/api/jobs/${job.slug}/apply`).send({ ...applyPayload, resumeKey: othersKey });
    expect(stolen.status).toBe(403);

    const malformed = await seeker.post(`/api/jobs/${job.slug}/apply`).send({ ...applyPayload, resumeKey: "resumes/../../secrets.pdf" });
    expect(malformed.status).toBe(400);

    const badLinkedin = await seeker.post(`/api/jobs/${job.slug}/apply`).send({ ...applyPayload, linkedinUrl: "https://evil.test/in/x" });
    expect(badLinkedin.status).toBe(400);
    expect(badLinkedin.body.fields.linkedinUrl).toBeDefined();

    expect(await db.select().from(applications)).toHaveLength(0);
  });

  it("shows employers their applicants, lets them update status, and serves resumes as signed URLs", async () => {
    const { employer, job, seeker } = await setup();
    const { resumeKey } = await uploadResume(seeker);
    const applied = await seeker.post(`/api/jobs/${job.slug}/apply`).send({ ...applyPayload, resumeKey });
    const applicationId = applied.body.application.id;

    const list = await employer.get(`/api/employer/jobs/${job.id}/applications`);
    expect(list.status).toBe(200);
    expect(list.body.applications).toHaveLength(1);
    expect(list.body.applications[0]).toMatchObject({
      id: applicationId,
      fullName: "Jordan Rivera",
      email: "jordan@example.com",
      hasResume: true,
      status: "new",
      profile: null
    });
    expect(list.body.applications[0]).not.toHaveProperty("resumeKey");

    const update = await employer.put(`/api/employer/applications/${applicationId}`).send({ status: "interviewing" });
    expect(update.status).toBe(200);
    expect((await employer.put(`/api/employer/applications/${applicationId}`).send({ status: "ghosted" })).status).toBe(400);

    const resume = await employer.get(`/api/employer/applications/${applicationId}/resume`);
    expect(resume.status).toBe(200);
    expect(resume.body.url).toBe(`https://r2.test/signed/${resumeKey}?expires=900`);

    const jobsList = await employer.get("/api/employer/jobs");
    expect(jobsList.body.jobs[0].stats.applications).toBe(1);

    const mine = await seeker.get("/api/applications");
    expect(mine.status).toBe(200);
    expect(mine.body.applications[0]).toMatchObject({ status: "interviewing", hasResume: true });
    expect(mine.body.applications[0].job).toMatchObject({ slug: job.slug, open: true });
  });

  it("hides applicants and resumes from other companies", async () => {
    const { job, seeker } = await setup();
    const { resumeKey } = await uploadResume(seeker);
    const applied = await seeker.post(`/api/jobs/${job.slug}/apply`).send({ ...applyPayload, resumeKey });
    const applicationId = applied.body.application.id;

    const { agent: rival } = await createEmployerWithCompany(app, "rival@globex.test", "Globex");
    expect((await rival.get(`/api/employer/jobs/${job.id}/applications`)).status).toBe(404);
    expect((await rival.put(`/api/employer/applications/${applicationId}`).send({ status: "rejected" })).status).toBe(404);
    expect((await rival.get(`/api/employer/applications/${applicationId}/resume`)).status).toBe(404);
    expect((await seeker.get(`/api/employer/applications/${applicationId}/resume`)).status).toBe(403);

    const stored = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
    expect(stored?.status).toBe("new");
  });

  it("links the applicant's published rep profile", async () => {
    const { employer, job, seeker } = await setup();
    const user = await db.query.users.findFirst({ where: eq(users.email, "jordan@example.com") });
    await db.insert(repProfiles).values({
      userId: user!.id,
      slug: "jordan-rivera",
      displayName: "Jordan Rivera",
      headline: "Mid-market AE, 132% of quota",
      isPublished: true,
      verificationTier: "verified"
    });

    await seeker.post(`/api/jobs/${job.slug}/apply`).send(applyPayload);
    const list = await employer.get(`/api/employer/jobs/${job.id}/applications`);
    expect(list.body.applications[0].profile).toEqual({
      slug: "jordan-rivera",
      displayName: "Jordan Rivera",
      headline: "Mid-market AE, 132% of quota",
      verificationTier: "verified"
    });
  });
});
