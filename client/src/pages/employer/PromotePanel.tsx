import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Card, TextField, readApiError, type FieldErrors } from "../../components/ui";
import { DEFAULT_CPC_CENTS, MAX_CPC_CENTS, MIN_CPC_CENTS, MIN_DAILY_BUDGET_CENTS } from "../../../../shared/promotions";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCents } from "../../lib/jobs";

type Promotion = { id: string; status: "active" | "paused"; dailyBudgetCents: number; cpcCents: number };
type DailyRow = { day: string; impressions: number; clicks: number; spendCents: number };
type PromotionResponse = { promotion: Promotion | null; spentTodayCents: number; daily: DailyRow[] };

const toDollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (dollars: string) => Math.round(Number(dollars.replace(/[^0-9.]/g, "")) * 100);

export function PromotePanel({ jobId, live }: { jobId: string; live: boolean }) {
  const { company, refresh } = useAuth();
  const [data, setData] = useState<PromotionResponse | null>(null);
  const [budget, setBudget] = useState("10.00");
  const [cpc, setCpc] = useState(toDollars(DEFAULT_CPC_CENTS));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const response = await apiRequest<PromotionResponse>(`/api/employer/jobs/${jobId}/promotion`);
    setData(response);
    if (response.promotion) {
      setBudget(toDollars(response.promotion.dailyBudgetCents));
      setCpc(toDollars(response.promotion.cpcCents));
    }
  }, [jobId]);

  useEffect(() => {
    void load().catch(() => setError("Couldn’t load promotion settings."));
    void refresh();
  }, [load, refresh]);

  async function save(status: "active" | "paused") {
    setSaving(true);
    setError(null);
    setSaved(false);
    setFieldErrors({});
    try {
      await apiRequest(`/api/employer/jobs/${jobId}/promotion`, {
        method: "PUT",
        body: JSON.stringify({ status, dailyBudgetCents: toCents(budget), cpcCents: toCents(cpc) })
      });
      await load();
      setSaved(true);
    } catch (caught) {
      const { message, fields } = readApiError(caught);
      setError(Object.keys(fields).length ? "Check the highlighted fields." : message);
      setFieldErrors(fields);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save("active");
  }

  const promotion = data?.promotion ?? null;
  const active = promotion?.status === "active";
  const budgetCents = toCents(budget) || 0;
  const cpcCents = toCents(cpc) || 0;
  const clicksPerDay = cpcCents > 0 ? Math.floor(budgetCents / cpcCents) : 0;
  const balance = company?.creditBalanceCents ?? 0;
  const totals = (data?.daily ?? []).reduce(
    (sum, row) => ({ impressions: sum.impressions + row.impressions, clicks: sum.clicks + row.clicks, spendCents: sum.spendCents + row.spendCents }),
    { impressions: 0, clicks: 0, spendCents: 0 }
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Promote this job</h2>
        {promotion ? <Badge tone={active ? "green" : "slate"}>{active ? "Sponsored: running" : "Paused"}</Badge> : null}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Sponsored jobs appear at the top of matching searches with a “Sponsored” label. You pay only when someone clicks, once per
        person per day, and never more than your daily budget.
      </p>

      {balance < (cpcCents || MIN_CPC_CENTS) ? (
        <div className="mt-4">
          <Alert tone="info">
            Your credit balance is {formatCents(balance)}. Sponsored listings pause automatically when credits run out.{" "}
            <Link to="/employer/billing" className="font-semibold underline">
              Add credits
            </Link>
          </Alert>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label="Daily budget ($)"
          inputMode="decimal"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          error={fieldErrors.dailyBudgetCents}
          hint={`Minimum ${formatCents(MIN_DAILY_BUDGET_CENTS)}`}
        />
        <TextField
          label="Cost per click ($)"
          inputMode="decimal"
          value={cpc}
          onChange={(event) => setCpc(event.target.value)}
          error={fieldErrors.cpcCents}
          hint={`${formatCents(MIN_CPC_CENTS)}–${formatCents(MAX_CPC_CENTS)}. Higher bids win the top slots.`}
        />
        <p className="text-sm text-slate-700 sm:col-span-2">
          Up to <strong>{clicksPerDay}</strong> click{clicksPerDay === 1 ? "" : "s"} a day, and at most{" "}
          <strong>{formatCents(budgetCents * 30)}</strong> over 30 days.
        </p>
        {error ? <div className="sm:col-span-2"><Alert>{error}</Alert></div> : null}
        {saved ? <div className="sm:col-span-2"><Alert tone="success">Promotion saved.</Alert></div> : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving || !live}>
            {active ? "Update promotion" : "Start promoting"}
          </Button>
          {active ? (
            <Button type="button" variant="secondary" disabled={saving} onClick={() => void save("paused")}>
              Pause
            </Button>
          ) : null}
        </div>
        {!live ? <p className="text-xs text-slate-500 sm:col-span-2">Publish the job to promote it.</p> : null}
      </form>

      {promotion ? (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold">Last 30 days</h3>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Impressions</dt>
              <dd className="text-lg font-semibold">{totals.impressions}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Clicks</dt>
              <dd className="text-lg font-semibold">{totals.clicks}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Click-through</dt>
              <dd className="text-lg font-semibold">{totals.impressions ? `${((totals.clicks / totals.impressions) * 100).toFixed(1)}%` : "–"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Spend</dt>
              <dd className="text-lg font-semibold">{formatCents(totals.spendCents)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">Spent today: {formatCents(data?.spentTodayCents ?? 0)} of {formatCents(promotion.dailyBudgetCents)}</p>
        </div>
      ) : null}
    </Card>
  );
}
