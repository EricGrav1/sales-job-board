import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { resetEnvForTests } from "../config/env";
import { closeDb, db } from "../db";
import { getStripe } from "../services/stripe";
import { companies, creditLedger, stripeEvents } from "../../shared/schema";
import { clearDatabase, completeJob, createEmployerWithCompany, createPublishedJob, createVerifiedAgent } from "../test/helpers";

const app = createApp();
const originalEnv = { ...process.env };

function mockCheckoutCreate() {
  return vi
    .spyOn(getStripe().checkout.sessions, "create")
    .mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.test/cs_test_123" } as never);
}

function sendWebhook(event: Record<string, unknown>, secret = "whsec_test_secret") {
  const payload = JSON.stringify(event);
  const signature = getStripe().webhooks.generateTestHeaderString({ payload, secret });
  return request(app)
    .post("/api/billing/webhook")
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", signature)
    .send(payload);
}

function creditsCompletedEvent(companyId: string, overrides: Record<string, unknown> = {}, eventId = "evt_credits_1") {
  return {
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_credits_1",
        object: "checkout.session",
        mode: "payment",
        payment_status: "paid",
        amount_total: 10000,
        customer: "cus_test_1",
        client_reference_id: companyId,
        metadata: { kind: "credits", companyId, creditsCents: "10000" },
        ...overrides
      }
    }
  };
}

function subscriptionEvent(type: string, companyId: string, status: string, eventId: string) {
  return {
    id: eventId,
    object: "event",
    type,
    data: {
      object: {
        id: "sub_test_1",
        object: "subscription",
        customer: "cus_test_1",
        status,
        metadata: { companyId },
        items: { data: [{ current_period_end: 1893456000 }] }
      }
    }
  };
}

async function company(companyId: string) {
  return (await db.query.companies.findFirst({ where: eq(companies.id, companyId) }))!;
}

function setEnv(changes: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvForTests();
}

describe("Stripe billing (M11)", () => {
  beforeEach(async () => {
    await clearDatabase();
    await db.delete(stripeEvents);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    resetEnvForTests();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("creates a credit Checkout Session for an allowed pack and credits nothing until the webhook", async () => {
    const create = mockCheckoutCreate();
    const { agent, company: created } = await createEmployerWithCompany(app, "boss@acme.test");

    const invalid = await agent.post("/api/billing/credits/checkout").send({ amountCents: 1234 });
    expect(invalid.status).toBe(400);

    const response = await agent.post("/api/billing/credits/checkout").send({ amountCents: 10000 });
    expect(response.status).toBe(200);
    expect(response.body.url).toBe("https://checkout.stripe.test/cs_test_123");

    const params = create.mock.calls[0][0]!;
    expect(params).toMatchObject({
      mode: "payment",
      customer_email: "boss@acme.test",
      customer_creation: "always",
      client_reference_id: created.id,
      metadata: { kind: "credits", companyId: created.id, creditsCents: "10000" }
    });
    expect(params.line_items![0].price_data).toMatchObject({ currency: "usd", unit_amount: 10000 });
    expect((await company(created.id)).creditBalanceCents).toBe(0);
  });

  it("rejects webhooks with a missing or bad signature", async () => {
    const { company: created } = await createEmployerWithCompany(app, "boss@acme.test");
    const payload = JSON.stringify(creditsCompletedEvent(created.id));

    const missing = await request(app).post("/api/billing/webhook").set("Content-Type", "application/json").send(payload);
    expect(missing.status).toBe(400);

    const forged = await sendWebhook(creditsCompletedEvent(created.id), "whsec_attacker");
    expect(forged.status).toBe(400);
    expect((await company(created.id)).creditBalanceCents).toBe(0);
  });

  it("adds credits exactly once even when the webhook is delivered twice", async () => {
    const { company: created } = await createEmployerWithCompany(app, "boss@acme.test");

    const first = await sendWebhook(creditsCompletedEvent(created.id));
    expect(first.status).toBe(200);
    expect(first.body.result).toBe("processed");

    const retry = await sendWebhook(creditsCompletedEvent(created.id));
    expect(retry.body.result).toBe("duplicate");

    // A different event id for the same Checkout Session is still only credited once.
    await sendWebhook(creditsCompletedEvent(created.id, {}, "evt_credits_2"));

    const updated = await company(created.id);
    expect(updated.creditBalanceCents).toBe(10000);
    expect(updated.stripeCustomerId).toBe("cus_test_1");
    const ledger = await db.select().from(creditLedger).where(eq(creditLedger.companyId, created.id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: "topup", amountCents: 10000, stripeCheckoutSessionId: "cs_test_credits_1" });
  });

  it("does not credit unpaid or mismatched sessions", async () => {
    const { company: created } = await createEmployerWithCompany(app, "boss@acme.test");
    await sendWebhook(creditsCompletedEvent(created.id, { payment_status: "unpaid" }, "evt_unpaid"));
    await sendWebhook(creditsCompletedEvent(created.id, { id: "cs_other", amount_total: 500 }, "evt_mismatch"));
    expect((await company(created.id)).creditBalanceCents).toBe(0);
  });

  it("flips the plan with subscription webhooks and applies the premium job limit", async () => {
    const { agent, company: created } = await createEmployerWithCompany(app, "boss@acme.test");
    await createPublishedJob(agent);
    const second = await agent.post("/api/employer/jobs").send({ ...completeJob, title: "SDR" });
    expect((await agent.post(`/api/employer/jobs/${second.body.job.id}/publish`)).status).toBe(402);

    await sendWebhook(subscriptionEvent("customer.subscription.created", created.id, "active", "evt_sub_1"));
    const premium = await company(created.id);
    expect(premium).toMatchObject({ plan: "premium", stripeSubscriptionId: "sub_test_1", stripeCustomerId: "cus_test_1" });
    expect(premium.premiumCurrentPeriodEnd?.toISOString()).toBe("2030-01-01T00:00:00.000Z");

    expect((await agent.post(`/api/employer/jobs/${second.body.job.id}/publish`)).status).toBe(200);
    const billing = await agent.get("/api/billing");
    expect(billing.body).toMatchObject({ plan: "premium", activeJobLimit: 25, canManageSubscription: true });

    await sendWebhook(subscriptionEvent("customer.subscription.updated", created.id, "past_due", "evt_sub_2"));
    expect((await company(created.id)).plan).toBe("free");
    await sendWebhook(subscriptionEvent("customer.subscription.updated", created.id, "active", "evt_sub_3"));
    expect((await company(created.id)).plan).toBe("premium");

    await sendWebhook(subscriptionEvent("customer.subscription.deleted", created.id, "canceled", "evt_sub_4"));
    expect(await company(created.id)).toMatchObject({ plan: "free", stripeSubscriptionId: null, premiumCurrentPeriodEnd: null });
  });

  it("applies the 3-month launch coupon only while the promo is active", async () => {
    const create = mockCheckoutCreate();
    const { agent } = await createEmployerWithCompany(app, "boss@acme.test");

    await agent.post("/api/billing/premium/checkout");
    expect(create.mock.calls[0][0]).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_test_premium", quantity: 1 }],
      discounts: [{ coupon: "coupon_test_launch" }]
    });
    expect((await agent.get("/api/billing")).body.launchPromoActive).toBe(true);

    setEnv({ LAUNCH_PROMO_ENDS_AT: "2020-01-01T00:00:00Z" });
    await agent.post("/api/billing/premium/checkout");
    expect(create.mock.calls[1][0]).not.toHaveProperty("discounts");
    expect((await agent.get("/api/billing")).body.launchPromoActive).toBe(false);

    setEnv({ LAUNCH_PROMO_ENDS_AT: "2099-01-01T00:00:00Z", STRIPE_LAUNCH_COUPON_ID: undefined });
    await agent.post("/api/billing/premium/checkout");
    expect(create.mock.calls[2][0]).not.toHaveProperty("discounts");
  });

  it("returns 409 for premium checkout when already premium and for the portal without a customer", async () => {
    const { agent, company: created } = await createEmployerWithCompany(app, "boss@acme.test");
    expect((await agent.post("/api/billing/portal")).status).toBe(409);

    await db.update(companies).set({ plan: "premium", stripeCustomerId: "cus_x" }).where(eq(companies.id, created.id));
    expect((await agent.post("/api/billing/premium/checkout")).status).toBe(409);

    const portal = vi
      .spyOn(getStripe().billingPortal.sessions, "create")
      .mockResolvedValue({ url: "https://billing.stripe.test/p" } as never);
    const response = await agent.post("/api/billing/portal");
    expect(response.body.url).toBe("https://billing.stripe.test/p");
    expect(portal.mock.calls[0][0]).toMatchObject({ customer: "cus_x" });
  });

  it("fulfills immediately in the dev fallback without calling Stripe", async () => {
    setEnv({ STRIPE_SECRET_KEY: "placeholder-stripe-secret-key", NODE_ENV: "development" });
    const create = mockCheckoutCreate();
    const { agent, company: created } = await createEmployerWithCompany(app, "boss@acme.test");

    const credits = await agent.post("/api/billing/credits/checkout").send({ amountCents: 5000 });
    expect(credits.body.url).toBe("http://localhost:5173/employer/billing?dev=1");
    const upgrade = await agent.post("/api/billing/premium/checkout");
    expect(upgrade.status).toBe(200);

    expect(create).not.toHaveBeenCalled();
    expect(await company(created.id)).toMatchObject({ creditBalanceCents: 5000, plan: "premium" });
  });

  it("is employer-only", async () => {
    const rep = await createVerifiedAgent(app, "rep@example.com", "rep");
    expect((await rep.get("/api/billing")).status).toBe(403);
    expect((await rep.post("/api/billing/credits/checkout").send({ amountCents: 5000 })).status).toBe(403);
    expect((await request(app).get("/api/billing")).status).toBe(401);
  });
});
