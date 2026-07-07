import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { closeDb, db } from "../db";
import { events, users } from "../../shared/schema";

const app = createApp();

async function clearDatabase() {
  await db.delete(events);
  await db.delete(users);
}

async function registerAndCaptureVerificationToken(agent: ReturnType<typeof request.agent>, email: string, password: string) {
  const logs: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });

  const response = await agent.post("/api/auth/register").send({ email, password });
  logSpy.mockRestore();

  expect(response.status).toBe(201);
  const linkMatch = logs.join("\n").match(/https?:\/\/\S+/);
  expect(linkMatch?.[0]).toBeTruthy();

  const verificationUrl = new URL(linkMatch![0]);
  const token = verificationUrl.searchParams.get("token");
  expect(token).toBeTruthy();

  return token!;
}

describe("auth routes", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("registers, logs a verification link in dev, verifies, logs in, and returns /auth/me", async () => {
    const agent = request.agent(app);
    const email = "rep-happy@example.com";
    const password = "correct-password";

    const token = await registerAndCaptureVerificationToken(agent, email, password);

    const verifyResponse = await agent.post("/api/auth/verify").send({ token });
    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.user.email).toBe(email);
    expect(verifyResponse.body.user.emailVerifiedAt).toBeTruthy();

    const loginResponse = await agent.post("/api/auth/login").send({ email, password });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers["set-cookie"]).toBeTruthy();

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe(email);
    expect(meResponse.body.user.emailVerifiedAt).toBeTruthy();
    expect(meResponse.body.profile).toBeNull();
  });

  it("rejects a wrong password", async () => {
    const agent = request.agent(app);
    const email = "wrong-password@example.com";

    await registerAndCaptureVerificationToken(agent, email, "correct-password");

    const response = await agent.post("/api/auth/login").send({
      email,
      password: "incorrect-password"
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid email or password");
  });

  it("rejects duplicate email registration", async () => {
    const agent = request.agent(app);
    const email = "duplicate@example.com";

    await registerAndCaptureVerificationToken(agent, email, "correct-password");

    const response = await agent.post("/api/auth/register").send({
      email: "DUPLICATE@example.com",
      password: "another-password"
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Email already registered");

    const userRows = await db.select().from(users).where(eq(users.email, email));
    expect(userRows).toHaveLength(1);
  });

  it("returns 403 for unverified users on /profile routes", async () => {
    const agent = request.agent(app);
    const email = "unverified-profile@example.com";
    const password = "correct-password";

    await registerAndCaptureVerificationToken(agent, email, password);

    const loginResponse = await agent.post("/api/auth/login").send({ email, password });
    expect(loginResponse.status).toBe(200);

    const profileResponse = await agent.get("/api/profile");
    expect(profileResponse.status).toBe(403);
    expect(profileResponse.body.error).toBe("Email verification required");
  });
});
