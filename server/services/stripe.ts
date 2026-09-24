import Stripe from "stripe";
import { getEnv } from "../config/env";
import type { Company } from "../../shared/schema";

let cachedClient: Stripe | undefined;

export function getStripe() {
  cachedClient ??= new Stripe(getEnv().STRIPE_SECRET_KEY);
  return cachedClient;
}

// Dev fallback (SPEC §5): placeholder keys outside production fulfill checkouts locally.
// env.ts refuses placeholder Stripe values in production, so this can't be on in prod.
export function isDevBilling() {
  const env = getEnv();
  return env.NODE_ENV !== "production" && env.STRIPE_SECRET_KEY.startsWith("placeholder");
}

export function launchPromoActive(now = new Date()) {
  const env = getEnv();
  return Boolean(env.STRIPE_LAUNCH_COUPON_ID && env.LAUNCH_PROMO_ENDS_AT && now < env.LAUNCH_PROMO_ENDS_AT);
}

function billingUrl(query: string) {
  return new URL(`/employer/billing?${query}`, getEnv().APP_URL).toString();
}

function customerFields(company: Company, email: string) {
  return company.stripeCustomerId ? { customer: company.stripeCustomerId } : { customer_email: email };
}

export async function createCreditsCheckout(company: Company, email: string, amountCents: number) {
  return getStripe().checkout.sessions.create({
    mode: "payment",
    ...customerFields(company, email),
    ...(company.stripeCustomerId ? {} : { customer_creation: "always" as const }),
    client_reference_id: company.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: "Job promotion credits" }
        }
      }
    ],
    metadata: { kind: "credits", companyId: company.id, creditsCents: String(amountCents) },
    success_url: billingUrl("checkout=success"),
    cancel_url: billingUrl("checkout=cancelled")
  });
}

export async function createPremiumCheckout(company: Company, email: string, now = new Date()) {
  const env = getEnv();
  return getStripe().checkout.sessions.create({
    mode: "subscription",
    ...customerFields(company, email),
    client_reference_id: company.id,
    line_items: [{ price: env.STRIPE_PREMIUM_PRICE_ID, quantity: 1 }],
    ...(launchPromoActive(now) ? { discounts: [{ coupon: env.STRIPE_LAUNCH_COUPON_ID! }] } : {}),
    metadata: { kind: "premium", companyId: company.id },
    subscription_data: { metadata: { companyId: company.id } },
    success_url: billingUrl("checkout=success"),
    cancel_url: billingUrl("checkout=cancelled")
  });
}

export async function createPortalSession(customerId: string) {
  return getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: billingUrl("portal=return")
  });
}

// Verifies the Stripe-Signature header against the RAW request body. Throws if invalid.
export function constructWebhookEvent(rawBody: Buffer, signature: string) {
  return getStripe().webhooks.constructEvent(rawBody, signature, getEnv().STRIPE_WEBHOOK_SECRET);
}
