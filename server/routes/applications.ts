import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requireEmailVerified, requireRole } from "../middleware/auth";
import { applyRateLimit, uploadRateLimit } from "../middleware/rateLimit";
import { validateBody, validateParams } from "../middleware/validate";
import { isJobOpen } from "../services/jobRules";
import { toPublicJob } from "../services/jobViews";
import { createPresignedUploadUrl, createSignedGetUrl } from "../services/r2";
import { asyncHandler, isUniqueViolation } from "../utils/http";
import { applications, companies, events, jobs, repProfiles, users } from "../../shared/schema";
import {
  applicationStatusUpdateSchema,
  applySchema,
  idParamsSchema,
  resumeUploadSchema,
  type ApplyInput
} from "../../shared/validators";
import { findOpenJobBySlug } from "./jobs";

const seekerOnly = [asyncHandler(requireAuth), requireEmailVerified, requireRole("rep")];

function resumePrefix(userId: string) {
  return `resumes/${userId}/`;
}

// ---- Job seeker: /api/applications ----

export const seekerApplicationsRouter = Router();
seekerApplicationsRouter.use(...seekerOnly);

seekerApplicationsRouter.post(
  "/resume-upload-url",
  uploadRateLimit(),
  validateBody(resumeUploadSchema),
  asyncHandler(async (req, res) => {
    const resumeKey = `${resumePrefix(req.currentUser!.id)}${randomUUID()}.pdf`;
    const uploadUrl = await createPresignedUploadUrl(resumeKey, req.body.contentType, req.body.sizeBytes);
    return res.status(200).json({ uploadUrl, resumeKey });
  })
);

seekerApplicationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({ application: applications, job: jobs, company: companies })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(eq(applications.userId, req.currentUser!.id))
      .orderBy(desc(applications.createdAt));

    return res.status(200).json({
      applications: rows.map(({ application, job, company }) => ({
        id: application.id,
        status: application.status,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        hasResume: Boolean(application.resumeKey),
        job: { ...toPublicJob(job, company), open: isJobOpen(job) }
      }))
    });
  })
);

// ---- Job seeker: POST /api/jobs/:slug/apply (mounted on the jobs router) ----

export const applyHandlers = [
  ...seekerOnly,
  applyRateLimit(),
  validateBody(applySchema),
  asyncHandler(async (req, res) => {
    const input = req.body as ApplyInput;
    const userId = req.currentUser!.id;
    const row = await findOpenJobBySlug(String(req.params.slug));
    if (!row) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (row.job.applyMethod !== "platform") {
      return res.status(422).json({ error: "This job takes applications on the company's own site" });
    }
    // Only accept resume keys this user was issued, so nobody can attach someone else's file.
    if (input.resumeKey && !/^resumes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/.test(input.resumeKey)) {
      return res.status(400).json({ error: "Validation failed", fields: { resumeKey: ["Invalid resume"] } });
    }
    if (input.resumeKey && !input.resumeKey.startsWith(resumePrefix(userId))) {
      return res.status(403).json({ error: "That resume doesn't belong to you" });
    }

    const profile = await db.query.repProfiles.findFirst({ where: eq(repProfiles.userId, userId) });

    try {
      const [application] = await db
        .insert(applications)
        .values({
          jobId: row.job.id,
          userId,
          profileId: profile?.isPublished ? profile.id : null,
          fullName: input.fullName,
          phone: input.phone ?? null,
          linkedinUrl: input.linkedinUrl ?? null,
          resumeKey: input.resumeKey ?? null,
          coverNote: input.coverNote ?? null
        })
        .returning();

      await db.insert(events).values({ actorUserId: userId, type: "job_apply", targetId: row.job.id });

      return res.status(201).json({ application: { id: application.id, status: application.status, createdAt: application.createdAt } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: "You already applied to this job" });
      }
      throw error;
    }
  })
];

// ---- Employer: mounted under /api/employer (requireCompany already ran) ----

export const employerApplicationsRouter = Router();

// Company scoping: an application is only visible if its job belongs to the caller's company.
async function findCompanyApplication(companyId: string, applicationId: string) {
  const [row] = await db
    .select({ application: applications })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(applications.id, applicationId), eq(jobs.companyId, companyId)))
    .limit(1);
  return row?.application ?? null;
}

employerApplicationsRouter.get(
  "/jobs/:id/applications",
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, String(req.params.id)), eq(jobs.companyId, req.company!.id))
    });
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const rows = await db
      .select({ application: applications, email: users.email, profile: repProfiles })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.userId))
      .leftJoin(repProfiles, and(eq(repProfiles.id, applications.profileId), eq(repProfiles.isPublished, true)))
      .where(eq(applications.jobId, job.id))
      .orderBy(desc(applications.createdAt));

    return res.status(200).json({
      applications: rows.map(({ application, email, profile }) => ({
        id: application.id,
        fullName: application.fullName,
        email,
        phone: application.phone,
        linkedinUrl: application.linkedinUrl,
        coverNote: application.coverNote,
        status: application.status,
        hasResume: Boolean(application.resumeKey),
        createdAt: application.createdAt,
        profile: profile
          ? {
              slug: profile.slug,
              displayName: profile.displayName,
              headline: profile.headline,
              verificationTier: profile.verificationTier
            }
          : null
      }))
    });
  })
);

employerApplicationsRouter.put(
  "/applications/:id",
  validateParams(idParamsSchema),
  validateBody(applicationStatusUpdateSchema),
  asyncHandler(async (req, res) => {
    const existing = await findCompanyApplication(req.company!.id, String(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: "Application not found" });
    }

    const [application] = await db
      .update(applications)
      .set({ status: req.body.status, updatedAt: new Date() })
      .where(eq(applications.id, existing.id))
      .returning();

    return res.status(200).json({ application: { id: application.id, status: application.status } });
  })
);

employerApplicationsRouter.get(
  "/applications/:id/resume",
  validateParams(idParamsSchema),
  asyncHandler(async (req, res) => {
    const application = await findCompanyApplication(req.company!.id, String(req.params.id));
    if (!application?.resumeKey) {
      return res.status(404).json({ error: "Resume not found" });
    }

    return res.status(200).json({ url: await createSignedGetUrl(application.resumeKey) });
  })
);
