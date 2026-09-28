import { and, count, desc, eq, gt, ilike, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { JOBS_PAGE_SIZE } from "../../shared/jobs";
import { companies, jobSearchVector, jobs } from "../../shared/schema";
import type { JobSearchQuery } from "../../shared/validators";
import { toPublicJob } from "./jobViews";

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// Filters shared by organic results and (in M10) the sponsored slot, so both honor the same search.
export function jobSearchConditions(query: JobSearchQuery, now = new Date()) {
  const conditions: SQL[] = [eq(jobs.status, "published"), gt(jobs.expiresAt, now)];

  if (query.category) conditions.push(eq(jobs.category, query.category));
  if (query.level) conditions.push(eq(jobs.level, query.level));
  if (query.workplace) conditions.push(eq(jobs.workplace, query.workplace));
  if (query.employmentType) conditions.push(eq(jobs.employmentType, query.employmentType));
  if (query.minOte != null) {
    // A job qualifies if the top of its pay range reaches the seeker's minimum.
    conditions.push(sql`coalesce(${jobs.oteMax}, ${jobs.baseMax}) >= ${query.minOte}`);
  }
  if (query.location) conditions.push(ilike(jobs.location, `%${escapeLike(query.location)}%`));

  const tsQuery = query.q ? sql`websearch_to_tsquery('english', ${query.q})` : null;
  if (query.q && tsQuery) {
    conditions.push(
      or(sql`${jobSearchVector(jobs)} @@ ${tsQuery}`, ilike(companies.name, `%${escapeLike(query.q)}%`))!
    );
  }

  return { conditions, tsQuery };
}

export async function searchOrganicJobs(query: JobSearchQuery, excludeJobIds: string[] = []) {
  const { conditions, tsQuery } = jobSearchConditions(query);
  if (excludeJobIds.length > 0) {
    conditions.push(notInArray(jobs.id, excludeJobIds));
  }
  const where = and(...conditions);
  const orderBy = tsQuery
    ? [desc(sql`ts_rank(${jobSearchVector(jobs)}, ${tsQuery})`), desc(jobs.publishedAt)]
    : [desc(jobs.publishedAt)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ job: jobs, company: companies })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(where)
      .orderBy(...orderBy, desc(jobs.id))
      .limit(JOBS_PAGE_SIZE)
      .offset((query.page - 1) * JOBS_PAGE_SIZE),
    db
      .select({ total: count() })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(where)
  ]);

  return { results: rows.map((row) => toPublicJob(row.job, row.company)), total };
}

export async function findOpenJobBySlug(slug: string) {
  const [row] = await db
    .select({ job: jobs, company: companies })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(jobs.slug, slug), eq(jobs.status, "published"), gt(jobs.expiresAt, new Date())))
    .limit(1);

  return row ?? null;
}
