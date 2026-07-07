import { relations, sql, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["rep", "admin"]);
export const roleTypeEnum = pgEnum("role_type", ["sdr", "ae", "am", "field", "inside", "manager", "other"]);
export const verificationTierEnum = pgEnum("verification_tier", [
  "unverified",
  "self_reported",
  "verified"
]);
export const proofTypeEnum = pgEnum("proof_type", ["leaderboard", "commission", "award", "other"]);
export const proofStatusEnum = pgEnum("proof_status", ["pending", "approved", "rejected"]);
export const eventTypeEnum = pgEnum("event_type", ["profile_view", "proof_view", "signup", "publish"]);

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
