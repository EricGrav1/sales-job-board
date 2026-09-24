import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requireEmailVerified, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { findAvailableCompanySlug, findCompanyForUser, requireCompany } from "../services/companies";
import { asyncHandler, isUniqueViolation } from "../utils/http";
import { companies, companyMembers } from "../../shared/schema";
import { companyUpsertSchema, type CompanyUpsertInput } from "../../shared/validators";

export const employerRouter = Router();

employerRouter.use(asyncHandler(requireAuth), requireEmailVerified, requireRole("employer"));

function companyValues(input: CompanyUpsertInput) {
  return {
    name: input.name,
    website: input.website ?? null,
    description: input.description?.trim() ? input.description.trim() : null,
    sizeBand: input.sizeBand ?? null
  };
}

employerRouter.get(
  "/company",
  asyncHandler(async (req, res) => {
    const company = await findCompanyForUser(req.currentUser!.id);
    return res.status(200).json({ company });
  })
);

employerRouter.post(
  "/company",
  validateBody(companyUpsertSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as CompanyUpsertInput;
    if (await findCompanyForUser(req.currentUser!.id)) {
      return res.status(409).json({ error: "You already have a company" });
    }

    const slug = await findAvailableCompanySlug(input.name);

    try {
      const company = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(companies)
          .values({ ...companyValues(input), slug })
          .returning();
        await tx.insert(companyMembers).values({
          companyId: created.id,
          userId: req.currentUser!.id,
          role: "owner"
        });
        return created;
      });

      return res.status(201).json({ company });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: "You already have a company" });
      }
      throw error;
    }
  })
);

employerRouter.put(
  "/company",
  asyncHandler(requireCompany),
  validateBody(companyUpsertSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as CompanyUpsertInput;
    const slug =
      input.name === req.company!.name ? req.company!.slug : await findAvailableCompanySlug(input.name, req.company!.id);

    const [company] = await db
      .update(companies)
      .set({ ...companyValues(input), slug, updatedAt: new Date() })
      .where(eq(companies.id, req.company!.id))
      .returning();

    return res.status(200).json({ company });
  })
);
