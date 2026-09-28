import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { getEnv } from "../config/env";
import { db } from "../db";
import { requireAuth, requireEmailVerified, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { fulfillCreditsPurchase, handleStripeEvent } from "../services/billing";
import { requireCompany } from "../services/companies";
import { planFor } from "../services/plans";
import {
  constructWebhookEvent,
  createCreditsCheckout,
  createPortalSession,
  createPremiumCheckout,
  isDevBilling,
  launchPromoActive
} from "../services/stripe";
import { asyncHandler } from "../utils/http";
import { CREDIT_PACKS_CENTS } from "../../shared/billing";
import { companies, creditLedger } from "../../shared/schema";
import { creditsCheckoutSchema } from "../../shared/validators";

export const billingRouter = Router();

billingRouter.use(asyncHandler(requireAuth), requireEmailVerified, requireRole("employer"), asyncHandler(requireCompany));

function devReturnUrl() {
  return new URL("/employer/billing?dev=1", getEnv().APP_URL).toString();
}

billingRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const company = req.company!;
    const ledger = await db
      .select({ id: creditLedger.id, amountCents: creditLedger.amountCents, type: creditLedger.type, createdAt: creditLedger.createdAt })
      .from(creditLedger)
      .where(eq(creditLedger.companyId, company.id))
      .orderBy(desc(creditLedger.createdAt))
      .limit(50);

    return res.status(200).json({
      plan: company.plan,
      premiumCurrentPeriodEnd: company.premiumCurrentPeriodEnd,
      activeJobLimit: planFor(company).activeJobLimit,
      creditBalanceCents: company.creditBalanceCents,
      canManageSubscription: Boolean(company.stripeCustomerId),
      launchPromoActive: launchPromoActive(),
      launchPromoEndsAt: launchPromoActive() ? getEnv().LAUNCH_PROMO_ENDS_AT : null,
      creditPacksCents: CREDIT_PACKS_CENTS,
      devBilling: isDevBilling(),
      ledger
    });
  })
);

billingRouter.post(
  "/credits/checkout",
  validateBody(creditsCheckoutSchema),
  asyncHandler(async (req, res) => {
    const company = req.company!;
    const amountCents = req.body.amountCents as number;

    if (isDevBilling()) {
      await db.transaction((tx) => fulfillCreditsPurchase(tx, company.id, amountCents, `dev_cs_${randomUUID()}`));
      console.log(`[dev-billing] Added ${amountCents} cents of credits to company ${company.id}`);
      return res.status(200).json({ url: devReturnUrl() });
    }

    const session = await createCreditsCheckout(company, req.currentUser!.email, amountCents);
    return res.status(200).json({ url: session.url });
  })
);

billingRouter.post(
  "/premium/checkout",
  asyncHandler(async (req, res) => {
    const company = req.company!;
    if (company.plan === "premium") {
      return res.status(409).json({ error: "You're already on Premium" });
    }

    if (isDevBilling()) {
      await db
        .update(companies)
        .set({ plan: "premium", premiumCurrentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), updatedAt: new Date() })
        .where(eq(companies.id, company.id));
      console.log(`[dev-billing] Upgraded company ${company.id} to premium`);
      return res.status(200).json({ url: devReturnUrl() });
    }

    const session = await createPremiumCheckout(company, req.currentUser!.email);
    return res.status(200).json({ url: session.url });
  })
);

billingRouter.post(
  "/portal",
  asyncHandler(async (req, res) => {
    const company = req.company!;
    if (!company.stripeCustomerId) {
      return res.status(409).json({ error: "No billing account yet" });
    }
    const session = await createPortalSession(company.stripeCustomerId);
    return res.status(200).json({ url: session.url });
  })
);

// Mounted in app.ts BEFORE express.json(): signature verification needs the exact raw bytes.
export const stripeWebhookHandlers = [
  express.raw({ type: "application/json", limit: "1mb" }),
  asyncHandler(async (req, res) => {
    const signature = req.get("stripe-signature");
    if (!signature || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: "Missing signature" });
    }

    let event;
    try {
      event = constructWebhookEvent(req.body, signature);
    } catch {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const result = await handleStripeEvent(event);
    return res.status(200).json({ received: true, result });
  })
];
