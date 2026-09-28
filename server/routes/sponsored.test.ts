import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { signClickToken, utcDay } from "../services/sponsored";
import { companies, creditLedger, promotionClicks, promotionDailyStats, promotions } from "../../shared/schema";
import { clearDatabase, createEmployerWithCompany, createPublishedJob, createVerifiedAgent } from "../test/helpers";

const app = createApp();

type Agent = Awaited<ReturnType<typeof createEmployerWithCompany>>["agent"];

async function fund(companyId: string, cents: number) {
  await db.update(companies).set({ creditBalanceCents: cents }).where(eq(companies.id, companyId));
}

async function balance(companyId: string) {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
  return company!.creditBalanceCents;
}

async function promote(agent: Agent, jobId: string, body: Record<string, unknown>) {
  const response = await agent.put(`/api/employer/jobs/${jobId}/promotion`).send({ status: "active", ...body });
  expect(response.status).toBe(200);
  return response.body.promotion as { id: string };
}

async function sponsoredFor(query = "") {
  const response = await request(app).get(`/api/jobs${query}`);
  expect(response.status).toBe(200);
  return response.body as {
    sponsored: Array<{ id: string; slug: string; clickToken: string }>;
    results: Array<{ id: string }>;
  };
}

function click(slug: string, clickToken: string, userAgent = "viewer-1") {
  return request(app).post(`/api/jobs/${slug}/click`).set("User-Agent", userAgent).send({ clickToken });
}

async function statsFor(promotionId: string) {
  const [row] = await db
    .select()
    .from(promotionDailyStats)
    .where(eq(promotionDailyStats.promotionId, promotionId));
  return row ?? { impressions: 0, clicks: 0, chargedClicks: 0, spendCents: 0 };
}

async function fundedPromotedJob(email: string, name: string, promotion: { dailyBudgetCents: number; cpcCents: number }, credits = 10_000, jobOverrides = {}) {
  const { agent, company } = await createEmployerWithCompany(app, email, name);
  const job = await createPublishedJob(agent, jobOverrides);
  await fund(company.id, credits);
  const promo = await promote(agent, job.id, promotion);
  return { agent, company, job, promotion: promo };
}

describe("sponsored jobs (M10)", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("validates promotion settings and requires a live job to activate", async () => {
    const { agent } = await createEmployerWithCompany(app, "boss@acme.test");
    const job = await createPublishedJob(agent);

    for (const [body, field] of [
      [{ dailyBudgetCents: 499, cpcCents: 100 }, "dailyBudgetCents"],
      [{ dailyBudgetCents: 5000, cpcCents: 24 }, "cpcCents"],
      [{ dailyBudgetCents: 5000, cpcCents: 2001 }, "cpcCents"],
      [{ dailyBudgetCents: 500, cpcCents: 600 }, "cpcCents"]
    ] as const) {
      const response = await agent.put(`/api/employer/jobs/${job.id}/promotion`).send({ status: "active", ...body });
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.fields[field]).toBeDefined();
    }

    const draft = await agent.post("/api/employer/jobs").send({ title: "Draft SDR" });
    const inactive = await agent
      .put(`/api/employer/jobs/${draft.body.job.id}/promotion`)
      .send({ status: "active", dailyBudgetCents: 1000, cpcCents: 100 });
    expect(inactive.status).toBe(422);
    const paused = await agent
      .put(`/api/employer/jobs/${draft.body.job.id}/promotion`)
      .send({ status: "paused", dailyBudgetCents: 1000, cpcCents: 100 });
    expect(paused.status).toBe(200);

    const upsert1 = await promote(agent, job.id, { dailyBudgetCents: 1000, cpcCents: 100 });
    const upsert2 = await promote(agent, job.id, { dailyBudgetCents: 2000, cpcCents: 150 });
    expect(upsert2.id).toBe(upsert1.id);

    const { agent: rival } = await createEmployerWithCompany(app, "rival@globex.test", "Globex");
    expect((await rival.put(`/api/employer/jobs/${job.id}/promotion`).send({ status: "active", dailyBudgetCents: 1000, cpcCents: 100 })).status).toBe(404);
    expect((await rival.get(`/api/employer/jobs/${job.id}/promotion`)).status).toBe(404);
  });

  it("fills up to 3 sponsored slots with eligible jobs, highest CPC first, and counts impressions", async () => {
    const a = await fundedPromotedJob("a@a.test", "Alpha", { dailyBudgetCents: 5000, cpcCents: 300 });
    const b = await fundedPromotedJob("b@b.test", "Bravo", { dailyBudgetCents: 5000, cpcCents: 500 });
    const c = await fundedPromotedJob("c@c.test", "Charlie", { dailyBudgetCents: 5000, cpcCents: 200 });
    const d = await fundedPromotedJob("d@d.test", "Delta", { dailyBudgetCents: 5000, cpcCents: 100 });
    // Ineligible: can't afford one click, paused, over today's budget, doesn't match the filter.
    const broke = await fundedPromotedJob("e@e.test", "Echo", { dailyBudgetCents: 5000, cpcCents: 900 }, 800);
    const paused = await fundedPromotedJob("f@f.test", "Foxtrot", { dailyBudgetCents: 5000, cpcCents: 1000 });
    await promote(paused.agent, paused.job.id, { status: "paused", dailyBudgetCents: 5000, cpcCents: 1000 });
    const spent = await fundedPromotedJob("g@g.test", "Golf", { dailyBudgetCents: 1000, cpcCents: 950 });
    await db.insert(promotionDailyStats).values({ promotionId: spent.promotion.id, day: utcDay(), spendCents: 100 });

    const all = await sponsoredFor();
    expect(all.sponsored.map((job) => job.id)).toEqual([b.job.id, a.job.id, c.job.id]);
    expect(all.sponsored.every((job) => typeof job.clickToken === "string")).toBe(true);
    const organicIds = all.results.map((job) => job.id);
    expect(organicIds).not.toContain(b.job.id);
    expect(organicIds).toContain(d.job.id);
    expect(organicIds).toContain(broke.job.id);

    expect((await statsFor(b.promotion.id)).impressions).toBe(1);
    expect((await statsFor(d.promotion.id)).impressions).toBe(0);

    // Filters apply to sponsored slots too.
    const sdr = await fundedPromotedJob("h@h.test", "Hotel", { dailyBudgetCents: 5000, cpcCents: 50 }, 10_000, {
      title: "SDR",
      category: "sdr_bdr",
      level: "entry"
    });
    const entry = await sponsoredFor("?level=entry");
    expect(entry.sponsored.map((job) => job.id)).toEqual([sdr.job.id]);
    expect(entry.results).toEqual([]);
  });

  it("charges the CPC once per viewer per day and never bills the company's own team", async () => {
    const { agent, company, job, promotion } = await fundedPromotedJob("boss@acme.test", "Acme", { dailyBudgetCents: 5000, cpcCents: 150 });
    const [{ clickToken }] = (await sponsoredFor()).sponsored;

    expect((await click(job.slug, clickToken, "viewer-1")).status).toBe(204);
    expect((await click(job.slug, clickToken, "viewer-1")).status).toBe(204);
    expect(await balance(company.id)).toBe(10_000 - 150);

    await click(job.slug, clickToken, "viewer-2");
    expect(await balance(company.id)).toBe(10_000 - 300);

    const seeker = await createVerifiedAgent(app, "seeker@example.com", "rep");
    await seeker.post(`/api/jobs/${job.slug}/click`).send({ clickToken });
    await seeker.post(`/api/jobs/${job.slug}/click`).set("User-Agent", "different-device").send({ clickToken });
    expect(await balance(company.id)).toBe(10_000 - 450);

    await agent.post(`/api/jobs/${job.slug}/click`).send({ clickToken });
    expect(await balance(company.id)).toBe(10_000 - 450);

    expect(await statsFor(promotion.id)).toMatchObject({ clicks: 3, chargedClicks: 3, spendCents: 450 });
    const ledger = await db.select().from(creditLedger).where(eq(creditLedger.companyId, company.id));
    expect(ledger.map((entry) => entry.amountCents)).toEqual([-150, -150, -150]);
    expect(ledger.every((entry) => entry.type === "click" && entry.promotionClickId)).toBe(true);

    const clicks = await db.select().from(promotionClicks);
    expect(clicks.every((row) => !row.viewerHash.includes("127.0.0.1"))).toBe(true);

    const report = await agent.get(`/api/employer/jobs/${job.id}/promotion`);
    expect(report.body).toMatchObject({ spentTodayCents: 450 });
    expect(report.body.daily).toHaveLength(1);
    const list = await agent.get("/api/employer/jobs");
    expect(list.body.jobs[0].stats).toMatchObject({ impressions: 1, clicks: 3, spendCents: 450 });
  });

  it("stops charging exactly at the daily budget", async () => {
    const { company, job, promotion } = await fundedPromotedJob("boss@acme.test", "Acme", { dailyBudgetCents: 500, cpcCents: 200 });
    const [{ clickToken }] = (await sponsoredFor()).sponsored;

    for (const viewer of ["v1", "v2", "v3", "v4"]) {
      await click(job.slug, clickToken, viewer);
    }

    expect(await statsFor(promotion.id)).toMatchObject({ clicks: 4, chargedClicks: 2, spendCents: 400 });
    expect(await balance(company.id)).toBe(10_000 - 400);
    expect((await sponsoredFor()).sponsored).toEqual([]);
  });

  it("never takes the balance below zero", async () => {
    const { company, job, promotion } = await fundedPromotedJob("boss@acme.test", "Acme", { dailyBudgetCents: 5000, cpcCents: 200 }, 300);
    const [{ clickToken }] = (await sponsoredFor()).sponsored;

    for (const viewer of ["v1", "v2", "v3"]) {
      await click(job.slug, clickToken, viewer);
    }

    expect(await balance(company.id)).toBe(100);
    expect(await statsFor(promotion.id)).toMatchObject({ chargedClicks: 1, spendCents: 200 });
    expect((await sponsoredFor()).sponsored).toEqual([]);

    await expect(
      db.update(companies).set({ creditBalanceCents: sql`${companies.creditBalanceCents} - 200` }).where(eq(companies.id, company.id))
    ).rejects.toThrow();
  });

  it("holds the budget under concurrent clicks", async () => {
    const { company, job, promotion } = await fundedPromotedJob("boss@acme.test", "Acme", { dailyBudgetCents: 1000, cpcCents: 100 });
    const [{ clickToken }] = (await sponsoredFor()).sponsored;

    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => click(job.slug, clickToken, `burst-${index}`)));
    expect(responses.every((response) => response.status === 204)).toBe(true);

    expect(await statsFor(promotion.id)).toMatchObject({ clicks: 20, chargedClicks: 10, spendCents: 1000 });
    expect(await balance(company.id)).toBe(9000);
  });

  it("ignores forged, expired, and mismatched click tokens", async () => {
    const { company, job, promotion } = await fundedPromotedJob("boss@acme.test", "Acme", { dailyBudgetCents: 5000, cpcCents: 100 });
    const other = await fundedPromotedJob("other@globex.test", "Globex", { dailyBudgetCents: 5000, cpcCents: 100 });
    const valid = signClickToken(promotion.id, job.id);

    const forged = `${valid.slice(0, -4)}AAAA`;
    const expired = signClickToken(promotion.id, job.id, Date.now() - 31 * 60 * 1000);
    const fromOtherPromotion = signClickToken(other.promotion.id, other.job.id);

    for (const token of [forged, expired, "not-a-token", fromOtherPromotion]) {
      expect((await click(job.slug, token)).status).toBe(204);
    }
    expect((await click(job.slug, "")).status).toBe(400);

    expect(await balance(company.id)).toBe(10_000);
    expect(await balance(other.company.id)).toBe(10_000);
    expect(await db.select().from(promotionClicks)).toHaveLength(0);
  });

  it("does not charge for clicks on a paused promotion", async () => {
    const { agent, company, job, promotion } = await fundedPromotedJob("boss@acme.test", "Acme", { dailyBudgetCents: 5000, cpcCents: 100 });
    const [{ clickToken }] = (await sponsoredFor()).sponsored;
    await promote(agent, job.id, { status: "paused", dailyBudgetCents: 5000, cpcCents: 100 });

    await click(job.slug, clickToken, "late-viewer");
    expect(await balance(company.id)).toBe(10_000);
    expect(await statsFor(promotion.id)).toMatchObject({ clicks: 1, chargedClicks: 0, spendCents: 0 });
    expect(await db.select().from(promotions)).toHaveLength(1);
  });
});
