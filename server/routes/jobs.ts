import { Router } from "express";
import { db } from "../db";
import { validateBody, validateQuery } from "../middleware/validate";
import { findOpenJobBySlug, searchOrganicJobs } from "../services/jobSearch";
import { toPublicJob } from "../services/jobViews";
import { recordSponsoredClick, selectSponsoredJobs } from "../services/sponsored";
import { asyncHandler } from "../utils/http";
import { JOBS_PAGE_SIZE } from "../../shared/jobs";
import { events } from "../../shared/schema";
import { clickSchema, jobSearchQuerySchema, type JobSearchQuery } from "../../shared/validators";

export const jobsRouter = Router();

jobsRouter.get(
  "/",
  validateQuery(jobSearchQuerySchema),
  asyncHandler(async (_req, res) => {
    const query = res.locals.query as JobSearchQuery;
    const sponsored = await selectSponsoredJobs(query);
    // A job shown in a sponsored slot isn't repeated in the organic list.
    const { results, total } = await searchOrganicJobs(
      query,
      sponsored.map((job) => job.id)
    );

    return res.status(200).json({
      sponsored,
      results,
      total,
      page: query.page,
      pageSize: JOBS_PAGE_SIZE
    });
  })
);

jobsRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const row = await findOpenJobBySlug(String(req.params.slug));
    if (!row) {
      return res.status(404).json({ error: "Job not found" });
    }

    await db.insert(events).values({
      actorUserId: req.session.userId ?? null,
      type: "job_view",
      targetId: row.job.id
    });

    const card = toPublicJob(row.job, row.company);
    return res.status(200).json({
      job: {
        ...card,
        description: row.job.description,
        company: { ...card.company, description: row.company.description, sizeBand: row.company.sizeBand }
      }
    });
  })
);

jobsRouter.post(
  "/:slug/click",
  validateBody(clickSchema),
  asyncHandler(async (req, res) => {
    // Always 204: the response never reveals whether (or how much) the employer was charged.
    await recordSponsoredClick(req, String(req.params.slug), req.body.clickToken);
    return res.status(204).send();
  })
);
