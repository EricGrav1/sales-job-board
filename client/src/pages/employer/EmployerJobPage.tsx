import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageContainer } from "../../components/Layout";
import { Alert, Badge, Button, Card, readApiError } from "../../components/ui";
import { ApiError, apiRequest } from "../../lib/api";
import { formatPay, type EmployerJob } from "../../lib/jobs";

export function EmployerJobPage() {
  const { id } = useParams();
  const [job, setJob] = useState<EmployerJob | null>(null);
  const [blockers, setBlockers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [planLimited, setPlanLimited] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await apiRequest<{ job: EmployerJob; publishBlockers: Record<string, string> }>(`/api/employer/jobs/${id}`);
      setJob(response.job);
      setBlockers(response.publishBlockers);
    } catch {
      setError("Couldn’t load this job.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "publish" | "close") {
    setBusy(true);
    setError(null);
    setPlanLimited(false);
    try {
      await apiRequest(`/api/employer/jobs/${id}/${action}`, { method: "POST" });
      await load();
    } catch (caught) {
      setPlanLimited(caught instanceof ApiError && caught.status === 402);
      setError(readApiError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  if (!job) {
    return <PageContainer>{error ? <Alert>{error}</Alert> : "Loading…"}</PageContainer>;
  }

  const live = job.state === "published";

  return (
    <PageContainer>
      <Link to="/employer" className="text-sm font-semibold text-accent">
        ← Dashboard
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            <Badge tone={live ? "green" : "slate"}>{live ? "Live" : job.state[0].toUpperCase() + job.state.slice(1)}</Badge>{" "}
            {job.compType ? formatPay({ ...job, compType: job.compType }) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/employer/jobs/${job.id}/edit`} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            Edit
          </Link>
          {live ? (
            <>
              <Link to={`/jobs/${job.slug}`} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
                View listing
              </Link>
              <Button variant="danger" disabled={busy} onClick={() => void act("close")}>
                Close job
              </Button>
            </>
          ) : (
            <Button disabled={busy || Object.keys(blockers).length > 0} onClick={() => void act("publish")}>
              {job.state === "draft" ? "Publish" : "Renew for 30 days"}
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <div className="mt-4">
          <Alert>
            {error}{" "}
            {planLimited ? (
              <Link to="/employer/billing" className="font-semibold underline">
                See plans
              </Link>
            ) : null}
          </Alert>
        </div>
      ) : null}
      {!live && Object.keys(blockers).length > 0 ? (
        <div className="mt-4">
          <Alert tone="info">
            Before publishing: {Object.values(blockers).join(" · ")}
          </Alert>
        </div>
      ) : null}
      <div id="job-sections" className="mt-6 space-y-6">
        <Card>
          <h2 className="text-lg font-semibold">Performance</h2>
          <p className="mt-2 text-sm text-slate-600">{job.stats?.views ?? 0} views</p>
        </Card>
      </div>
    </PageContainer>
  );
}
