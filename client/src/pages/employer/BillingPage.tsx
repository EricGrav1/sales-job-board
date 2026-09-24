import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageContainer } from "../../components/Layout";
import { Alert, Badge, Button, Card, readApiError } from "../../components/ui";
import { ApiError, apiRequest } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCents } from "../../lib/jobs";

type BillingResponse = {
  plan: "free" | "premium";
  premiumCurrentPeriodEnd: string | null;
  activeJobLimit: number;
  creditBalanceCents: number;
  canManageSubscription: boolean;
  launchPromoActive: boolean;
  launchPromoEndsAt: string | null;
  creditPacksCents: number[];
  devBilling: boolean;
  ledger: Array<{ id: string; amountCents: number; type: "topup" | "click" | "adjustment"; createdAt: string }>;
};

const ledgerLabels = { topup: "Credits purchased", click: "Sponsored click", adjustment: "Adjustment" };

export function BillingPage() {
  const { refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<BillingResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiRequest<BillingResponse>("/api/billing"));
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 409
          ? "Set up your company on the dashboard first."
          : "Couldn’t load billing."
      );
    }
  }, [refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  async function redirectTo(path: string, key: string, body?: unknown) {
    setBusy(key);
    setError(null);
    try {
      const { url } = await apiRequest<{ url: string }>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      window.location.assign(url);
    } catch (caught) {
      setError(readApiError(caught).message);
      setBusy(null);
    }
  }

  const checkout = searchParams.get("checkout");

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">Billing</h1>
      <div className="mt-4 space-y-3">
        {checkout === "success" ? <Alert tone="success">Payment received. Updates can take a few seconds to appear.</Alert> : null}
        {checkout === "cancelled" ? <Alert tone="info">Checkout cancelled. You weren’t charged.</Alert> : null}
        {searchParams.get("dev") ? <Alert tone="info">Dev mode: Stripe is not configured, so this was fulfilled locally with no payment.</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
      </div>

      {data ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Plan</h2>
              {data.plan === "premium" ? <Badge tone="blue">Premium</Badge> : <Badge>Free</Badge>}
            </div>
            {data.plan === "premium" ? (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  Up to {data.activeJobLimit} active jobs, plus the Premium employer badge on every listing.
                  {data.premiumCurrentPeriodEnd ? ` Renews ${new Date(data.premiumCurrentPeriodEnd).toLocaleDateString()}.` : ""}
                </p>
                {data.canManageSubscription ? (
                  <Button variant="secondary" className="mt-4" disabled={busy !== null} onClick={() => void redirectTo("/api/billing/portal", "portal")}>
                    Manage subscription
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-600">The free plan includes {data.activeJobLimit} active job.</p>
                <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
                  <p className="font-semibold text-slate-950">Premium</p>
                  <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                    <li>Up to 25 active job posts</li>
                    <li>“Premium employer” badge on your listings</li>
                  </ul>
                  {data.launchPromoActive ? (
                    <p className="mt-3 text-sm font-semibold text-accent">
                      Launch offer: discounted for your first 3 months
                      {data.launchPromoEndsAt ? ` (sign up by ${new Date(data.launchPromoEndsAt).toLocaleDateString()})` : ""}.
                    </p>
                  ) : null}
                  <Button className="mt-4" disabled={busy !== null} onClick={() => void redirectTo("/api/billing/premium/checkout", "premium")}>
                    {busy === "premium" ? "Opening checkout…" : "Upgrade to Premium"}
                  </Button>
                </div>
              </>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Promotion credits</h2>
            <p className="mt-1 text-3xl font-semibold">{formatCents(data.creditBalanceCents)}</p>
            <p className="mt-1 text-sm text-slate-600">Sponsored jobs spend credits per click.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {data.creditPacksCents.map((cents) => (
                <Button
                  key={cents}
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void redirectTo("/api/billing/credits/checkout", `credits-${cents}`, { amountCents: cents })}
                >
                  {busy === `credits-${cents}` ? "Opening…" : `Add ${formatCents(cents).replace(".00", "")}`}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <h2 className="text-lg font-semibold">Credit history</h2>
            {data.ledger.length === 0 ? <p className="mt-2 text-sm text-slate-600">No activity yet.</p> : null}
            <ul className="mt-3 divide-y divide-slate-200 text-sm">
              {data.ledger.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {ledgerLabels[entry.type]}
                    <span className="ml-2 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
                  </span>
                  <span className={`font-semibold ${entry.amountCents >= 0 ? "text-emerald-700" : "text-slate-700"}`}>
                    {entry.amountCents >= 0 ? "+" : "−"}
                    {formatCents(Math.abs(entry.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : !error ? (
        <p className="mt-6 text-sm text-slate-600">Loading…</p>
      ) : null}
    </PageContainer>
  );
}
