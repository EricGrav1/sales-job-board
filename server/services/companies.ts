import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { companies, companyMembers } from "../../shared/schema";
import { slugify } from "../utils/http";

export async function findCompanyForUser(userId: string) {
  const [row] = await db
    .select({ company: companies })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(eq(companyMembers.userId, userId))
    .limit(1);

  return row?.company ?? null;
}

export async function findAvailableCompanySlug(name: string, currentCompanyId?: string) {
  const baseSlug = slugify(name, "company");
  let suffix = 1;

  while (true) {
    const candidate = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const existing = await db.query.companies.findFirst({
      where: eq(companies.slug, candidate)
    });

    if (!existing || existing.id === currentCompanyId) {
      return candidate;
    }

    suffix += 1;
  }
}

// Loads the caller's company onto req.company. Every employer query must scope by req.company.id.
export async function requireCompany(req: Request, res: Response, next: NextFunction) {
  const company = await findCompanyForUser(req.currentUser!.id);
  if (!company) {
    return res.status(409).json({ error: "Create your company profile first", code: "company_required" });
  }

  req.company = company;
  return next();
}
