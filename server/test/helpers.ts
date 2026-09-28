import bcrypt from "bcrypt";
import request from "supertest";
import type { Express } from "express";
import { expect } from "vitest";
import { db } from "../db";
import { companies, events, users, type User } from "../../shared/schema";

export const TEST_PASSWORD = "correct-password";

let cachedHash: string | undefined;

async function passwordHash() {
  // bcrypt cost 12 is slow; hash once per test file.
  cachedHash ??= await bcrypt.hash(TEST_PASSWORD, 12);
  return cachedHash;
}

export async function clearDatabase() {
  await db.delete(events);
  await db.delete(companies);
  await db.delete(users);
}

export async function createVerifiedAgent(app: Express, email: string, role: User["role"] = "rep") {
  await db.insert(users).values({
    email,
    passwordHash: await passwordHash(),
    role,
    emailVerifiedAt: new Date()
  });

  const agent = request.agent(app);
  const loginResponse = await agent.post("/api/auth/login").send({ email, password: TEST_PASSWORD });
  expect(loginResponse.status).toBe(200);

  return agent;
}

export async function createEmployerWithCompany(app: Express, email: string, companyName = "Acme Revenue") {
  const agent = await createVerifiedAgent(app, email, "employer");
  const response = await agent.post("/api/employer/company").send({ name: companyName });
  expect(response.status).toBe(201);

  return { agent, company: response.body.company as { id: string; slug: string; name: string } };
}

export const completeJob = {
  title: "Mid-Market Account Executive",
  category: "account_executive",
  level: "mid",
  employmentType: "full_time",
  workplace: "remote",
  location: "Remote (US)",
  compType: "base_plus_commission",
  baseMin: 80000,
  baseMax: 95000,
  oteMin: 160000,
  oteMax: 190000,
  description:
    "Own a mid-market book selling workflow software to operations leaders. Full-cycle sales from discovery to close, " +
    "with SDR support and a 3-month ramp. Quota is $750k new ARR.",
  applyMethod: "platform"
};

type Agent = ReturnType<typeof request.agent>;

export async function createPublishedJob(agent: Agent, overrides: Record<string, unknown> = {}) {
  const created = await agent.post("/api/employer/jobs").send({ ...completeJob, ...overrides });
  expect(created.status).toBe(201);
  const published = await agent.post(`/api/employer/jobs/${created.body.job.id}/publish`);
  expect(published.status).toBe(200);
  return published.body.job as { id: string; slug: string };
}
