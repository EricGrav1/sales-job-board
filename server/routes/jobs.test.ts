import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { companies, events, jobs } from "../../shared/schema";
import { clearDatabase, createEmployerWithCompany } from "../test/helpers";

const app = createApp();

const completeJob = {
  title: "Mid-Market Account Executive",
  category: "account_executive",
  level: "mid",
  employmentType: "full_time",
  workplace: "remote",
  location: "Remote (US)",
  compType: "base_plus_commission",
  baseMin: 80000,
  baseMax: 95000,
  oteMin: 160000,
  oteMax: 190000,
  description:
    "Own a mid-market book selling workflow software to operations leaders. Full-cycle sales from discovery to close, " +
    "with SDR support and a 3-month ramp. Quota is $750k new ARR.",
  applyMethod: "platform"
};

type Agent = Awaited<ReturnType<typeof createEmployerWithCompany>>["agent"];

async function createPublishedJob(agent: Agent, overrides: Record<string, unknown> = {}) {
  const created = await agent.post("/api/employer/jobs").send({ ...completeJob, ...overrides });
  expect(created.status).toBe(201);
  const published = await agent.post(`/api/employer/jobs/${created.body.job.id}/publish`);
  expect(published.status).toBe(200);
  return published.body.job as { id: string; slug: string };
}

async function makePremium(companyId: string) {
  await db.update(companies).set({ plan: "premium" }).where(eq(companies.id, companyId));
}

describe("job posts + public board (M8)", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("requires a company before managing jobs", async () => {
    const { agent } = await createEmployerWithCompany(app, "boss@acme.test");
    await db.delete(companies);
    const response = await agent.post("/api/employer/jobs").send(completeJob);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("company_required");
  });

  it("returns 422 with a reason for every missing publish requirement", async () => {
    const { agent } = await createEmployerWithCompany(app, "boss@acme.test");
    const draft = await agent.post("/api/employer/jobs").send({ title: "SDR" });
    expect(draft.status).toBe(201);
    expect(draft.body.job.status).toBe("draft");

    const response = await agent.post(`/api/employer/jobs/${draft.body.job.id}/publish`);
    expect(response.status).toBe(422);
    expect(Object.keys(response.body.reasons).sort()).toEqual(
      ["category", "compType", "description", "employmentType", "level", "location", "workplace"].sort()
    );
  });

  it.each([
    ["salary_only needs base", { compType: "salary_only", baseMin: null, baseMax: null }, "baseMin"],
    ["commission_only needs OTE", { compType: "commission_only", oteMin: null, oteMax: null, baseMin: null, baseMax: null }, "oteMin"],
    ["base+commission needs OTE", { oteMin: null, oteMax: null }, "oteMin"],
    ["base+commission needs base", { baseMin: null, baseMax: null }, "baseMin"],
    ["OTE below base", { baseMin: 90000, baseMax: 95000, oteMin: 85000, oteMax: 190000 }, "oteMin"],
    ["description too short", { description: "Too short." }, "description"],
    ["external apply needs a URL", { applyMethod: "external", applyUrl: null }, "applyUrl"]
  ])("publish rule: %s", async (_name, overrides, field) => {
    const { agent } = await createEmployerWithCompany(app, "boss@acme.test");
    const draft = await agent.post("/api/employer/jobs").send({ ...completeJob, ...overrides });
    expect(draft.status).toBe(201);

    const response = await agent.post(`/api/employer/jobs/${draft.body.job.id}/publish`);
    expect(response.status).toBe(422);
    expect(response.body.reasons[field]).toBeDefined();
  });

  it("rejects inverted ranges and non-https apply URLs at save time", async () => {
    const { agent } = await createEmployerWithCompany(app, "boss@acme.test");
    const inverted = await agent.post("/api/employer/jobs").send({ ...completeJob, oteMin: 200000, oteMax: 100000 });
    expect(inverted.status).toBe(400);
    expect(inverted.body.fields.oteMin).toBeDefined();

    const insecure = await agent
      .post("/api/employer/jobs")
      .send({ ...completeJob, applyMethod: "external", applyUrl: "http://careers.acme.test" });
    expect(insecure.status).toBe(400);
    expect(insecure.body.fields.applyUrl).toBeDefined();
  });

  it("publishes for 30 days and blocks edits that would make a live job incomplete", async () => {
    const { agent } = await createEmployerWithCompany(app, "boss@acme.test");
    const job = await createPublishedJob(agent);
    const stored = await db.query.jobs.findFirst({ where: eq(jobs.id, job.id) });
    const days = (stored!.expiresAt!.getTime() - stored!.publishedAt!.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(30);

    const edit = await agent.put(`/api/employer/jobs/${job.id}`).send({ ...completeJob, oteMin: null, oteMax: null });
    expect(edit.status).toBe(422);
    expect(edit.body.reasons.oteMin).toBeDefined();

    const event = await db.query.events.findFirst({ where: and(eq(events.type, "job_publish"), eq(events.targetId, job.id)) });
    expect(event).toBeDefined();
  });

  it("enforces the free plan's 1 active job (402) and frees the slot on close", async () => {
    const { agent } = await createEmployerWithCompany(app, "boss@acme.test");
    const first = await createPublishedJob(agent);

    const second = await agent.post("/api/employer/jobs").send({ ...completeJob, title: "SDR" });
    const blocked = await agent.post(`/api/employer/jobs/${second.body.job.id}/publish`);
    expect(blocked.status).toBe(402);
    expect(blocked.body).toMatchObject({ code: "plan_limit", plan: "free", activeJobLimit: 1 });

    expect((await agent.post(`/api/employer/jobs/${first.id}/close`)).status).toBe(200);
    expect((await agent.post(`/api/employer/jobs/${second.body.job.id}/publish`)).status).toBe(200);

    // Re-publishing the closed first job is blocked again, because the slot is taken.
    expect((await agent.post(`/api/employer/jobs/${first.id}/publish`)).status).toBe(402);
  });

  it("does not count expired jobs toward the limit and lets premium post more", async () => {
    const { agent, company } = await createEmployerWithCompany(app, "boss@acme.test");
    const first = await createPublishedJob(agent);
    await db.update(jobs).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(jobs.id, first.id));
    await createPublishedJob(agent, { title: "SDR" });

    await makePremium(company.id);
    await createPublishedJob(agent, { title: "Enterprise AE" });
  });

  it("lists only published, unexpired jobs and 404s the rest", async () => {
    const { agent, company } = await createEmployerWithCompany(app, "boss@acme.test");
    await makePremium(company.id);
    const live = await createPublishedJob(agent);
    const closed = await createPublishedJob(agent, { title: "Closed role" });
    await agent.post(`/api/employer/jobs/${closed.id}/close`);
    const expired = await createPublishedJob(agent, { title: "Expired role" });
    await db.update(jobs).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(jobs.id, expired.id));
    const draft = await agent.post("/api/employer/jobs").send({ ...completeJob, title: "Draft role" });

    const list = await request(app).get("/api/jobs");
    expect(list.status).toBe(200);
    expect(list.body.results.map((job: { id: string }) => job.id)).toEqual([live.id]);
    expect(list.body.total).toBe(1);
    expect(list.body.sponsored).toEqual([]);
    expect(list.body.results[0].company).toEqual({
      name: "Acme Revenue",
      slug: company.slug,
      website: null,
      premium: true
    });

    for (const slug of [closed.slug, expired.slug, draft.body.job.slug]) {
      expect((await request(app).get(`/api/jobs/${slug}`)).status).toBe(404);
    }

    const detail = await request(app).get(`/api/jobs/${live.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.job.description).toContain("mid-market book");
    expect(detail.body.job).not.toHaveProperty("companyId");
    expect(detail.body.job.company).not.toHaveProperty("creditBalanceCents");

    const employerList = await agent.get("/api/employer/jobs");
    const liveStats = employerList.body.jobs.find((job: { id: string }) => job.id === live.id).stats;
    expect(liveStats.views).toBe(1);
    expect(employerList.body.jobs.find((job: { id: string }) => job.id === expired.id).state).toBe("expired");
  });

  it("filters by category, level, workplace, employment type, min OTE, location and keyword", async () => {
    const { agent, company } = await createEmployerWithCompany(app, "boss@acme.test", "Globex");
    await makePremium(company.id);
    const ae = await createPublishedJob(agent);
    const sdr = await createPublishedJob(agent, {
      title: "Sales Development Representative",
      category: "sdr_bdr",
      level: "entry",
      workplace: "onsite",
      location: "Austin, TX",
      baseMin: 55000,
      baseMax: 60000,
      oteMin: 75000,
      oteMax: 85000,
      description: "Prospect into cybersecurity teams with cold calls and sequences. " + "x".repeat(80)
    });
    const cro = await createPublishedJob(agent, {
      title: "Chief Revenue Officer",
      category: "sales_leadership",
      level: "executive",
      workplace: "hybrid",
      location: "New York, NY",
      compType: "salary_only",
      baseMin: 300000,
      baseMax: 350000,
      oteMin: null,
      oteMax: null,
      description: "Lead a 60-person revenue org through Series C scale. " + "y".repeat(80)
    });

    async function ids(query: string) {
      const response = await request(app).get(`/api/jobs?${query}`);
      expect(response.status, query).toBe(200);
      return response.body.results.map((job: { id: string }) => job.id).sort();
    }

    expect(await ids("level=entry")).toEqual([sdr.id]);
    expect(await ids("category=sales_leadership")).toEqual([cro.id]);
    expect(await ids("workplace=remote")).toEqual([ae.id]);
    expect(await ids("employmentType=full_time")).toEqual([ae.id, sdr.id, cro.id].sort());
    expect(await ids("minOte=150000")).toEqual([ae.id, cro.id].sort());
    expect(await ids("location=austin")).toEqual([sdr.id]);
    expect(await ids("q=cybersecurity")).toEqual([sdr.id]);
    expect(await ids("q=globex")).toEqual([ae.id, sdr.id, cro.id].sort());
    expect(await ids("q=revenue%20org&level=executive")).toEqual([cro.id]);
    expect(await ids("level=")).toEqual([ae.id, sdr.id, cro.id].sort());
    expect(await ids("location=100%25")).toEqual([]);

    expect((await request(app).get("/api/jobs?level=ceo")).status).toBe(400);
  });

  it("paginates 20 per page", async () => {
    const { company } = await createEmployerWithCompany(app, "boss@acme.test");
    const now = Date.now();
    await db.insert(jobs).values(
      Array.from({ length: 25 }, (_, index) => ({
        ...completeJob,
        category: "account_executive" as const,
        level: "mid" as const,
        employmentType: "full_time" as const,
        workplace: "remote" as const,
        compType: "base_plus_commission" as const,
        applyMethod: "platform" as const,
        companyId: company.id,
        slug: `job-${index}`,
        title: `AE ${index}`,
        status: "published" as const,
        publishedAt: new Date(now - index * 60_000),
        expiresAt: new Date(now + 86_400_000)
      }))
    );

    const page1 = await request(app).get("/api/jobs");
    expect(page1.body.results).toHaveLength(20);
    expect(page1.body.total).toBe(25);
    expect(page1.body.results[0].title).toBe("AE 0");

    const page2 = await request(app).get("/api/jobs?page=2");
    expect(page2.body.results).toHaveLength(5);
    expect(page2.body.results[4].title).toBe("AE 24");
  });

  it("never lets a company read or modify another company's jobs", async () => {
    const { agent: owner } = await createEmployerWithCompany(app, "owner@acme.test", "Acme");
    const { agent: rival } = await createEmployerWithCompany(app, "rival@globex.test", "Globex");
    const job = await createPublishedJob(owner);

    expect((await rival.get(`/api/employer/jobs/${job.id}`)).status).toBe(404);
    expect((await rival.put(`/api/employer/jobs/${job.id}`).send(completeJob)).status).toBe(404);
    expect((await rival.post(`/api/employer/jobs/${job.id}/publish`)).status).toBe(404);
    expect((await rival.post(`/api/employer/jobs/${job.id}/close`)).status).toBe(404);
    expect((await rival.get("/api/employer/jobs")).body.jobs).toEqual([]);

    const stored = await db.query.jobs.findFirst({ where: eq(jobs.id, job.id) });
    expect(stored?.status).toBe("published");
  });
});
