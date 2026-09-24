import { randomBytes } from "node:crypto";
import { Router } from "express";
import { and, count, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import { validateBody, validateParams } from "../middleware/validate";
import { isJobOpen, publishBlockers } from "../services/jobRules";
import { planFor } from "../services/plans";
import { asyncHandler, slugify } from "../utils/http";
import { JOB_LISTING_DAYS } from "../../shared/jobs";
import { applications, companies, events, jobs, type Job } from "../../shared/schema";
import { idParamsSchema, jobUpsertSchema, type JobUpsertInput } from "../../shared/validators";

// Mounted under /api/employer/jobs after requireCompany, so req.company is always set.
export const employerJobsRouter = Router();

function jobValues(input: JobUpsertInput) {
  const text = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
  return {
    title: input.title,
    category: input.category ?? null,
    level: input.level ?? null,
    employmentType: input.employmentType ?? null,
    workplace: input.workplace ?? null,
    location: text(input.location),
    compType: input.compType ?? null,
    baseMin: input.baseMin ?? null,
    baseMax: input.baseMax ?? null,
    oteMin: input.oteMin ?? null,
    oteMax: input.oteMax ?? null,
    description: text(input.description),
    applyMethod: input.applyMethod,
    applyUrl: input.applyMethod === "external" ? (input.applyUrl ?? null) : null
  };
}

function newJobSlug(title: string, companyName: string) {
  const titlePart = slugify(title, "job").slice(0, 60).replace(/-+$/, "");
  const companyPart = slugify(companyName, "company").slice(0, 40).replace(/-+$/, "");
  return `${titlePart}-${companyPart}-${randomBytes(3).toString("hex")}`;
}

// Company scoping lives here: every lookup by id also filters by the caller's company.
async function findCompanyJob(companyId: string, jobId: string) {
  return db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId))
  });
}

async function applicationCounts(jobIds: string[]) {
  if (jobIds.length === 0) {
    return new Map<string, number>();
  }
  const rows = await db
    .select({ jobId: applications.jobId, total: count() })
    .from(applications)
    .where(inArray(applications.jobId, jobIds))
    .groupBy(applications.jobId);
  return new Map(rows.map((row) => [row.jobId, row.total]));
}

async function viewCounts(jobIds: string[]) {
  if (jobIds.length === 0) {
    return new Map<string, number>();
  }
  const rows = await db
    .select({ jobId: events.targetId, views: count() })
    .from(events)
    .where(and(eq(events.type, "job_view"), inArray(events.targetId, jobIds)))
    .groupBy(events.targetId);
  return new Map(rows.map((row) => [row.jobId!, row.views]));
}

function withState(job: Job) {
  const now = new Date();
  const state = job.status === "published" && !isJobOpen(job, now) ? "expired" : job.status;
  return { ...job, state };
}

employerJobsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const companyJobs = await db.query.jobs.findMany({
      where: eq(jobs.companyId, req.company!.id),
      orderBy: desc(jobs.createdAt)
    });
    const jobIds = companyJobs.map((job) => job.id);
    const [views, applicants] = await Promise.all([viewCounts(jobIds), applicationCounts(jobIds)]);

    return res.status(200).json({
      jobs: companyJobs.map((job) => ({
        ...withState(job),
        stats: { views: views.get(job.id) ?? 0, applications: applicants.get(job.id) ?? 0 }
      })),
      activeJobLimit: planFor(req.company!).activeJobLimit
    });
  })
);

employerJobsRouter.post(
  "/",
  validateBody(jobUpsertSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as JobUpsertInput;
    const [job] = await db
      .insert(jobs)
      .values({
        ...jobValues(input),
        companyId: req.company!.id,
        createdByUserId: req.currentUser!.id,
        slug: newJobSlug(input.title, req.company!.name)
      })
      .returning();

    return res.status(201).json({ job: withState(job) });
  })
);

employerJobsRouter.get(
  "/:id",
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const job = await findCompanyJob(req.company!.id, String(req.params.id));
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    const [views, applicants] = await Promise.all([viewCounts([job.id]), applicationCounts([job.id])]);
    return res.status(200).json({
      job: { ...withState(job), stats: { views: views.get(job.id) ?? 0, applications: applicants.get(job.id) ?? 0 } },
      publishBlockers: publishBlockers(job)
    });
  })
);

employerJobsRouter.put(
  "/:id",
  validateParams(idParamsSchema),
  validateBody(jobUpsertSchema),
  asyncHandler(async (req, res) => {
    const existing = await findCompanyJob(req.company!.id, String(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }

    const values = jobValues(req.body as JobUpsertInput);
    // A live listing can't be edited into an unpublishable state (e.g. removing its pay range).
    if (existing.status === "published") {
      const reasons = publishBlockers({ ...existing, ...values });
      if (Object.keys(reasons).length > 0) {
        return res.status(422).json({ error: "A published job must stay complete", reasons });
      }
    }

    const [job] = await db
      .update(jobs)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(jobs.id, existing.id), eq(jobs.companyId, req.company!.id)))
      .returning();

    return res.status(200).json({ job: withState(job) });
  })
);

employerJobsRouter.post(
  "/:id/publish",
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const company = req.company!;
    const existing = await findCompanyJob(company.id, String(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: "Job not found" });
    }

    const now = new Date();
    if (isJobOpen(existing, now)) {
      // Already live: don't reset publishedAt, or employers could "bump" to the top of recency for free.
      return res.status(200).json({ job: withState(existing) });
    }

    const reasons = publishBlockers(existing);
    if (Object.keys(reasons).length > 0) {
      return res.status(422).json({ error: "Job is missing required fields", reasons });
    }

    // Lock the company row so two concurrent publishes can't both squeeze under the plan limit.
    const result = await db.transaction(async (tx) => {
      const [lockedCompany] = await tx.select().from(companies).where(eq(companies.id, company.id)).for("update");
      const { activeJobLimit } = planFor(lockedCompany);
      const [{ active }] = await tx
        .select({ active: count() })
        .from(jobs)
        .where(
          and(
            eq(jobs.companyId, company.id),
            eq(jobs.status, "published"),
            gt(jobs.expiresAt, now),
            ne(jobs.id, existing.id)
          )
        );
      if (active >= activeJobLimit) {
        return { limited: true as const, plan: lockedCompany.plan, activeJobLimit };
      }

      const [published] = await tx
        .update(jobs)
        .set({
          status: "published",
          publishedAt: now,
          expiresAt: new Date(now.getTime() + JOB_LISTING_DAYS * 24 * 60 * 60 * 1000),
          updatedAt: now
        })
        .where(and(eq(jobs.id, existing.id), eq(jobs.companyId, company.id)))
        .returning();
      return { limited: false as const, job: published };
    });

    if (result.limited) {
      const { plan, activeJobLimit } = result;
      return res.status(402).json({
        error: `Your ${plan} plan allows ${activeJobLimit} active job${activeJobLimit === 1 ? "" : "s"}. Upgrade to Premium or close a job.`,
        code: "plan_limit",
        plan,
        activeJobLimit
      });
    }

    const job = result.job;
    await db.insert(events).values({ actorUserId: req.currentUser!.id, type: "job_publish", targetId: job.id });

    return res.status(200).json({ job: withState(job) });
  })
);

employerJobsRouter.post(
  "/:id/close",
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const [job] = await db
      .update(jobs)
      .set({ status: "closed", updatedAt: new Date() })
      .where(and(eq(jobs.id, String(req.params.id)), eq(jobs.companyId, req.company!.id)))
      .returning();

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    return res.status(200).json({ job: withState(job) });
  })
);
