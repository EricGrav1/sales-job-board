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
