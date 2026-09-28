import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, count, eq, sql } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { applications, companies, events, promotionDailyStats, promotions } from "../../shared/schema";
import { clearDatabase, createEmployerWithCompany, createPublishedJob, createVerifiedAgent } from "../test/helpers";

const app = createApp();

describe("employer dashboard stats (M12)", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("reports views, applicants, impressions, clicks and spend that match the database", async () => {
    const { agent, company } = await createEmployerWithCompany(app, "boss@acme.test");
    await db.update(companies).set({ plan: "premium", creditBalanceCents: 10_000 }).where(eq(companies.id, company.id));
    const promoted = await createPublishedJob(agent);
    const plain = await createPublishedJob(agent, { title: "SDR", category: "sdr_bdr", level: "entry" });
    await agent.put(`/api/employer/jobs/${promoted.id}/promotion`).send({ status: "active", dailyBudgetCents: 5000, cpcCents: 200 });

    // Traffic: 3 searches (impressions), 2 distinct sponsored clicks, 3 detail views, 2 applications.
    let clickToken = "";
    for (let index = 0; index < 3; index += 1) {
      const search = await request(app).get("/api/jobs");
      clickToken = search.body.sponsored[0].clickToken;
    }
    await request(app).post(`/api/jobs/${promoted.slug}/click`).set("User-Agent", "a").send({ clickToken });
    await request(app).post(`/api/jobs/${promoted.slug}/click`).set("User-Agent", "b").send({ clickToken });
    await request(app).get(`/api/jobs/${promoted.slug}`);
    await request(app).get(`/api/jobs/${promoted.slug}`);
    await request(app).get(`/api/jobs/${plain.slug}`);
    for (const email of ["one@example.com", "two@example.com"]) {
      const seeker = await createVerifiedAgent(app, email, "rep");
      expect((await seeker.post(`/api/jobs/${promoted.slug}/apply`).send({ fullName: email })).status).toBe(201);
    }

    const dashboard = await agent.get("/api/employer/jobs");
    const byId = new Map(dashboard.body.jobs.map((job: { id: string; stats: unknown }) => [job.id, job.stats]));

    for (const job of [promoted, plain]) {
      const [{ views }] = await db
        .select({ views: count() })
        .from(events)
        .where(and(eq(events.type, "job_view"), eq(events.targetId, job.id)));
      const [{ applicants }] = await db.select({ applicants: count() }).from(applications).where(eq(applications.jobId, job.id));
      const [promo] = await db
        .select({
          impressions: sql<number>`coalesce(sum(${promotionDailyStats.impressions}), 0)::int`,
          clicks: sql<number>`coalesce(sum(${promotionDailyStats.clicks}), 0)::int`,
          spendCents: sql<number>`coalesce(sum(${promotionDailyStats.spendCents}), 0)::int`
        })
        .from(promotions)
        .leftJoin(promotionDailyStats, eq(promotionDailyStats.promotionId, promotions.id))
        .where(eq(promotions.jobId, job.id));

      expect(byId.get(job.id)).toEqual({
        views,
        applications: applicants,
        impressions: promo?.impressions ?? 0,
        clicks: promo?.clicks ?? 0,
        spendCents: promo?.spendCents ?? 0
      });
    }

    expect(byId.get(promoted.id)).toEqual({ views: 2, applications: 2, impressions: 3, clicks: 2, spendCents: 400 });
    expect(byId.get(plain.id)).toEqual({ views: 1, applications: 0, impressions: 0, clicks: 0, spendCents: 0 });

    const billing = await agent.get("/api/billing");
    expect(billing.body.creditBalanceCents).toBe(10_000 - 400);
  });
});
