import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { companies, creditLedger, stripeEvents } from "../../shared/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The only way credits are added. Idempotent on the checkout session id (unique in credit_ledger).
export async function fulfillCreditsPurchase(tx: Tx, companyId: string, amountCents: number, checkoutSessionId: string) {
  const inserted = await tx
    .insert(creditLedger)
    .values({ companyId, amountCents, type: "topup", stripeCheckoutSessionId: checkoutSessionId })
    .onConflictDoNothing()
    .returning({ id: creditLedger.id });
  if (inserted.length === 0) {
    return false;
  }
  await tx
    .update(companies)
    .set({ creditBalanceCents: sql`${companies.creditBalanceCents} + ${amountCents}`, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
  return true;
}

const PREMIUM_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing"]);

async function applySubscription(tx: Tx, subscription: Stripe.Subscription, deleted: boolean) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const companyId = subscription.metadata?.companyId;
  const company = await tx.query.companies.findFirst({
    where: companyId ? eq(companies.id, companyId) : eq(companies.stripeCustomerId, customerId)
  });
  if (!company) {
    console.warn(`[billing] subscription ${subscription.id} has no matching company`);
    return;
  }

  const premium = !deleted && PREMIUM_STATUSES.has(subscription.status);
  // Newer Stripe API versions report the billing period on subscription items.
  const periodEnd = subscription.items?.data?.[0]?.current_period_end;

  await tx
    .update(companies)
    .set({
      plan: premium ? "premium" : "free",
      premiumCurrentPeriodEnd: premium && periodEnd ? new Date(periodEnd * 1000) : null,
      stripeCustomerId: customerId,
      stripeSubscriptionId: deleted ? null : subscription.id,
      updatedAt: new Date()
    })
    .where(eq(companies.id, company.id));
}

async function applyCheckoutCompleted(tx: Tx, session: Stripe.Checkout.Session) {
  const companyId = session.metadata?.companyId ?? session.client_reference_id;
  if (!companyId) {
    return;
  }
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (customerId) {
    await tx.update(companies).set({ stripeCustomerId: customerId }).where(eq(companies.id, companyId));
  }

  if (session.metadata?.kind === "credits") {
    const creditsCents = Number(session.metadata.creditsCents);
    // Credit exactly what was paid for; anything unexpected is logged, not credited.
    if (session.payment_status !== "paid" || !Number.isInteger(creditsCents) || session.amount_total !== creditsCents) {
      console.warn(`[billing] checkout ${session.id} not credited (status ${session.payment_status}, total ${session.amount_total})`);
      return;
    }
    await fulfillCreditsPurchase(tx, companyId, creditsCents, session.id);
  }
  // Premium: the customer.subscription.* events carry the plan state; nothing else to do here.
}

// Processes a verified webhook event once. The event row and its effects commit together, so a
// failure rolls both back and Stripe's retry gets a clean second attempt.
export async function handleStripeEvent(event: Stripe.Event) {
  return db.transaction(async (tx) => {
    const recorded = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    if (recorded.length === 0) {
      return "duplicate" as const;
    }

    switch (event.type) {
      case "checkout.session.completed":
        await applyCheckoutCompleted(tx, event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await applySubscription(tx, event.data.object, false);
        break;
      case "customer.subscription.deleted":
        await applySubscription(tx, event.data.object, true);
        break;
      default:
        break;
    }
    return "processed" as const;
  });
}
