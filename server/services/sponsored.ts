import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getEnv } from "../config/env";
import { db } from "../db";
import { CLICK_TOKEN_TTL_MS, SPONSORED_SLOTS } from "../../shared/promotions";
import {
  companies,
  companyMembers,
  creditLedger,
  jobs,
  promotionClicks,
  promotionDailyStats,
  promotions
} from "../../shared/schema";
import type { JobSearchQuery } from "../../shared/validators";
import { isJobOpen } from "./jobRules";
import { jobSearchConditions } from "./jobSearch";
import { toPublicJob } from "./jobViews";

// ---- Signing ----
// One secret, separate purposes: prefixing the message ("click:" / "viewer:") keeps a signature made
// for one purpose from being valid for another.

function hmac(purpose: string, message: string) {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(`${purpose}:${message}`).digest("base64url");
}

export function signClickToken(promotionId: string, jobId: string, issuedAt = Date.now()) {
  const payload = `${promotionId}.${jobId}.${issuedAt}`;
  return `${payload}.${hmac("click", payload)}`;
}

export function verifyClickToken(token: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [promotionId, jobId, issuedAtRaw, signature] = parts;
  const expected = Buffer.from(hmac("click", `${promotionId}.${jobId}.${issuedAtRaw}`));
  const actual = Buffer.from(signature);
  // timingSafeEqual avoids leaking how many characters matched through response timing.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || now - issuedAt > CLICK_TOKEN_TTL_MS || issuedAt > now + 60_000) return null;
  return { promotionId, jobId };
}

// Stable per-viewer id for de-duplicating clicks. Raw IPs are never stored.
export function viewerHash(req: Request) {
  const userId = req.session.userId;
  const identity = userId ? `u:${userId}` : `a:${req.ip ?? ""}|${req.get("user-agent") ?? ""}`;
  return hmac("viewer", identity);
}

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// ---- Serving ----

const todaysStats = (day: string) =>
  and(eq(promotionDailyStats.promotionId, promotions.id), eq(promotionDailyStats.day, day));

// Up to SPONSORED_SLOTS jobs that match the search AND can still pay for a click today.
export async function selectSponsoredJobs(query: JobSearchQuery, now = new Date()) {
  const day = utcDay(now);
  const { conditions } = jobSearchConditions(query, now);

  const rows = await db
    .select({ job: jobs, company: companies, promotion: promotions })
    .from(promotions)
    .innerJoin(jobs, eq(jobs.id, promotions.jobId))
    .innerJoin(companies, eq(companies.id, promotions.companyId))
    .leftJoin(promotionDailyStats, todaysStats(day))
    .where(
      and(
        ...conditions,
        eq(promotions.status, "active"),
        gte(companies.creditBalanceCents, promotions.cpcCents),
        sql`coalesce(${promotionDailyStats.spendCents}, 0) + ${promotions.cpcCents} <= ${promotions.dailyBudgetCents}`
      )
    )
    .orderBy(desc(promotions.cpcCents), asc(promotions.createdAt))
    .limit(SPONSORED_SLOTS);

  if (rows.length > 0) {
    await db
      .insert(promotionDailyStats)
      .values(rows.map((row) => ({ promotionId: row.promotion.id, day, impressions: 1 })))
      .onConflictDoUpdate({
        target: [promotionDailyStats.promotionId, promotionDailyStats.day],
        set: { impressions: sql`${promotionDailyStats.impressions} + 1` }
      });
  }

  return rows.map((row) => ({
    ...toPublicJob(row.job, row.company),
    clickToken: signClickToken(row.promotion.id, row.job.id, now.getTime())
  }));
}

// ---- Charging (SPEC §6.1) ----

export type ClickOutcome = "invalid" | "own_company" | "duplicate" | "charged" | "not_billable";

export async function recordSponsoredClick(req: Request, slug: string, token: string, now = new Date()): Promise<ClickOutcome> {
  const verified = verifyClickToken(token, now.getTime());
  if (!verified) return "invalid";

  const day = utcDay(now);
  const viewer = viewerHash(req);
  const userId = req.session.userId;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ promotion: promotions, job: jobs })
      .from(promotions)
      .innerJoin(jobs, eq(jobs.id, promotions.jobId))
      .where(eq(promotions.id, verified.promotionId))
      .limit(1);
    if (!row || row.job.id !== verified.jobId || row.job.slug !== slug) return "invalid";
    const { promotion, job } = row;

    // Serialize all charges for this company: spend and balance checks below can't race.
    const [company] = await tx.select().from(companies).where(eq(companies.id, promotion.companyId)).for("update");

    if (userId) {
      const [member] = await tx
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(and(eq(companyMembers.companyId, company.id), eq(companyMembers.userId, userId)))
        .limit(1);
      if (member) return "own_company"; // employers checking their own listing: never billed, never counted
    }

    const [stats] = await tx
      .select({ spendCents: promotionDailyStats.spendCents })
      .from(promotionDailyStats)
      .where(and(eq(promotionDailyStats.promotionId, promotion.id), eq(promotionDailyStats.day, day)));
    const spentToday = stats?.spendCents ?? 0;

    const billable =
      promotion.status === "active" &&
      isJobOpen(job, now) &&
      spentToday + promotion.cpcCents <= promotion.dailyBudgetCents &&
      company.creditBalanceCents >= promotion.cpcCents;
    const charge = billable ? promotion.cpcCents : 0;

    const inserted = await tx
      .insert(promotionClicks)
      .values({ promotionId: promotion.id, day, viewerHash: viewer, chargedCents: charge })
      .onConflictDoNothing()
      .returning({ id: promotionClicks.id });
    if (inserted.length === 0) return "duplicate";

    if (charge > 0) {
      await tx.insert(creditLedger).values({
        companyId: company.id,
        amountCents: -charge,
        type: "click",
        promotionClickId: inserted[0].id
      });
      await tx
        .update(companies)
        .set({ creditBalanceCents: sql`${companies.creditBalanceCents} - ${charge}` })
        .where(eq(companies.id, company.id));
    }

    await tx
      .insert(promotionDailyStats)
      .values({ promotionId: promotion.id, day, clicks: 1, chargedClicks: charge > 0 ? 1 : 0, spendCents: charge })
      .onConflictDoUpdate({
        target: [promotionDailyStats.promotionId, promotionDailyStats.day],
        set: {
          clicks: sql`${promotionDailyStats.clicks} + 1`,
          chargedClicks: sql`${promotionDailyStats.chargedClicks} + ${charge > 0 ? 1 : 0}`,
          spendCents: sql`${promotionDailyStats.spendCents} + ${charge}`
        }
      });

    return charge > 0 ? "charged" : "not_billable";
  });
}

// ---- Employer analytics ----

export async function promotionTotalsByJob(jobIds: string[]) {
  if (jobIds.length === 0) return new Map<string, { impressions: number; clicks: number; spendCents: number }>();
  const rows = await db
    .select({
      jobId: promotions.jobId,
      impressions: sql<number>`coalesce(sum(${promotionDailyStats.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${promotionDailyStats.clicks}), 0)::int`,
      spendCents: sql<number>`coalesce(sum(${promotionDailyStats.spendCents}), 0)::int`
    })
    .from(promotions)
    .leftJoin(promotionDailyStats, eq(promotionDailyStats.promotionId, promotions.id))
    .where(inArray(promotions.jobId, jobIds))
    .groupBy(promotions.jobId);
  return new Map(rows.map(({ jobId, ...totals }) => [jobId, totals]));
}
