import { relations, sql, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgEnum,
  primaryKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { compTypeValues, employmentTypeValues, jobCategoryValues, jobLevelValues, workplaceValues } from "./jobs";

export const userRoleEnum = pgEnum("user_role", ["rep", "employer", "admin"]);
export const roleTypeEnum = pgEnum("role_type", ["sdr", "ae", "am", "field", "inside", "manager", "other"]);
export const verificationTierEnum = pgEnum("verification_tier", [
  "unverified",
  "self_reported",
  "verified"
]);
export const proofTypeEnum = pgEnum("proof_type", ["leaderboard", "commission", "award", "other"]);
export const proofStatusEnum = pgEnum("proof_status", ["pending", "approved", "rejected"]);
export const eventTypeEnum = pgEnum("event_type", [
  "profile_view",
  "proof_view",
  "signup",
  "publish",
  "job_view",
  "job_apply",
  "job_publish"
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("rep"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const repProfiles = pgTable("rep_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  headline: varchar("headline", { length: 120 }),
  bio: text("bio"),
  roleType: roleTypeEnum("role_type"),
  industries: text("industries").array().notNull().default(sql`ARRAY[]::text[]`),
  yearsExperience: integer("years_experience"),
  oteMin: integer("ote_min"),
  oteMax: integer("ote_max"),
  location: text("location"),
  remoteOk: boolean("remote_ok").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(false),
  verificationTier: verificationTierEnum("verification_tier").notNull().default("unverified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const performanceRecords = pgTable("performance_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => repProfiles.id, { onDelete: "cascade" }),
  periodLabel: text("period_label").notNull(),
  quotaAttainmentPct: integer("quota_attainment_pct"),
  rank: integer("rank"),
  teamSize: integer("team_size"),
  notes: varchar("notes", { length: 280 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const proofItems = pgTable("proof_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => repProfiles.id, { onDelete: "cascade" }),
  performanceRecordId: uuid("performance_record_id").references(() => performanceRecords.id, {
    onDelete: "set null"
  }),
  originalKey: text("original_key").notNull(),
  redactedKey: text("redacted_key"),
  thumbKey: text("thumb_key"),
  type: proofTypeEnum("type").notNull(),
  status: proofStatusEnum("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null"
  }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  type: eventTypeEnum("type").notNull(),
  targetId: uuid("target_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(repProfiles, {
    fields: [users.id],
    references: [repProfiles.userId]
  }),
  reviewedProofs: many(proofItems),
  events: many(events)
}));

export const repProfilesRelations = relations(repProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [repProfiles.userId],
    references: [users.id]
  }),
  performanceRecords: many(performanceRecords),
  proofItems: many(proofItems)
}));

export const performanceRecordsRelations = relations(performanceRecords, ({ one, many }) => ({
  profile: one(repProfiles, {
    fields: [performanceRecords.profileId],
    references: [repProfiles.id]
  }),
  proofItems: many(proofItems)
}));

export const proofItemsRelations = relations(proofItems, ({ one }) => ({
  profile: one(repProfiles, {
    fields: [proofItems.profileId],
    references: [repProfiles.id]
  }),
  performanceRecord: one(performanceRecords, {
    fields: [proofItems.performanceRecordId],
    references: [performanceRecords.id]
  }),
  reviewedBy: one(users, {
    fields: [proofItems.reviewedByUserId],
    references: [users.id]
  })
}));

export const companySizeBandEnum = pgEnum("company_size_band", [
  "1-10",
  "11-50",
  "51-200",
  "201-1000",
  "1000+"
]);
export const companyPlanEnum = pgEnum("company_plan", ["free", "premium"]);
export const companyMemberRoleEnum = pgEnum("company_member_role", ["owner"]);

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  website: text("website"),
  description: text("description"),
  sizeBand: companySizeBandEnum("size_band"),
  plan: companyPlanEnum("plan").notNull().default("free"),
  premiumCurrentPeriodEnd: timestamp("premium_current_period_end", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  creditBalanceCents: integer("credit_balance_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const companyMembers = pgTable(
  "company_members",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    role: companyMemberRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.companyId, table.userId] })]
);

export const jobCategoryEnum = pgEnum("job_category", jobCategoryValues);
export const jobLevelEnum = pgEnum("job_level", jobLevelValues);
export const employmentTypeEnum = pgEnum("employment_type", employmentTypeValues);
export const workplaceEnum = pgEnum("workplace", workplaceValues);
export const compTypeEnum = pgEnum("comp_type", compTypeValues);
export const applyMethodEnum = pgEnum("apply_method", ["platform", "external"]);
export const jobStatusEnum = pgEnum("job_status", ["draft", "published", "closed"]);

// Drafts may be incomplete, so most columns are nullable; publish rules (SPEC §6) enforce completeness.
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    slug: text("slug").notNull().unique(),
    title: varchar("title", { length: 120 }).notNull(),
    category: jobCategoryEnum("category"),
    level: jobLevelEnum("level"),
    employmentType: employmentTypeEnum("employment_type"),
    workplace: workplaceEnum("workplace"),
    location: varchar("location", { length: 160 }),
    compType: compTypeEnum("comp_type"),
    baseMin: integer("base_min"),
    baseMax: integer("base_max"),
    oteMin: integer("ote_min"),
    oteMax: integer("ote_max"),
    description: text("description"),
    applyMethod: applyMethodEnum("apply_method").notNull().default("platform"),
    applyUrl: text("apply_url"),
    status: jobStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("jobs_search_idx").using("gin", jobSearchVector(table)),
    index("jobs_listing_idx").on(table.status, table.expiresAt, table.publishedAt),
    index("jobs_company_idx").on(table.companyId)
  ]
);

// The search query must use this exact expression so Postgres can use jobs_search_idx.
export function jobSearchVector(table: { title: AnyPgColumn; description: AnyPgColumn; location: AnyPgColumn }) {
  return sql`to_tsvector('english', coalesce(${table.title}, '') || ' ' || coalesce(${table.description}, '') || ' ' || coalesce(${table.location}, ''))`;
}

export const applicationStatusEnum = pgEnum("application_status", [
  "new",
  "reviewed",
  "interviewing",
  "offer",
  "hired",
  "rejected"
]);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").references(() => repProfiles.id, { onDelete: "set null" }),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    linkedinUrl: text("linkedin_url"),
    resumeKey: text("resume_key"), // R2 key under resumes/<userId>/ — never public
    coverNote: varchar("cover_note", { length: 3000 }),
    status: applicationStatusEnum("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("applications_job_user_unique").on(table.jobId, table.userId), index("applications_user_idx").on(table.userId)]
);

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, {
    fields: [jobs.companyId],
    references: [companies.id]
  }),
  applications: many(applications)
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  job: one(jobs, {
    fields: [applications.jobId],
    references: [jobs.id]
  }),
  user: one(users, {
    fields: [applications.userId],
    references: [users.id]
  }),
  profile: one(repProfiles, {
    fields: [applications.profileId],
    references: [repProfiles.id]
  })
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  members: many(companyMembers),
  jobs: many(jobs)
}));

export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, {
    fields: [companyMembers.companyId],
    references: [companies.id]
  }),
  user: one(users, {
    fields: [companyMembers.userId],
    references: [users.id]
  })
}));

export const eventsRelations = relations(events, ({ one }) => ({
  actor: one(users, {
    fields: [events.actorUserId],
    references: [users.id]
  })
}));

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type RepProfile = InferSelectModel<typeof repProfiles>;
export type PerformanceRecord = InferSelectModel<typeof performanceRecords>;
export type ProofItem = InferSelectModel<typeof proofItems>;
export type Event = InferSelectModel<typeof events>;
export type Company = InferSelectModel<typeof companies>;
export type CompanyMember = InferSelectModel<typeof companyMembers>;
export type Job = InferSelectModel<typeof jobs>;
export type Application = InferSelectModel<typeof applications>;
