import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "../../components/Layout";
import { Alert, Badge, Card } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCents, type EmployerJob } from "../../lib/jobs";
import { CompanyForm } from "./CompanyForm";

type JobsResponse = { jobs: EmployerJob[]; activeJobLimit: number };

const stateBadge: Record<EmployerJob["state"], { label: string; tone: "green" | "slate" | "amber" | "red" }> = {
  published: { label: "Live", tone: "green" },
  draft: { label: "Draft", tone: "slate" },
  closed: { label: "Closed", tone: "red" },
  expired: { label: "Expired", tone: "amber" }
};

export function EmployerDashboardPage() {
  const { company, refresh } = useAuth();
  const [data, setData] = useState<JobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState(false);

  useEffect(() => {
    if (!company) return;
    apiRequest<JobsResponse>("/api/employer/jobs")
      .then(setData)
      .catch(() => setError("Couldn’t load your jobs."));
  }, [company]);

  if (!company) {
    return (
      <PageContainer>
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Set up your company</h1>
          <p className="mt-2 text-sm text-slate-600">Job seekers see this on every job you post.</p>
          <Card className="mt-6">
            <CompanyForm company={null} onSaved={() => void refresh()} />
          </Card>
        </div>
      </PageContainer>
    );
  }

  const activeCount = data?.jobs.filter((job) => job.state === "published").length ?? 0;

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {company.plan === "premium" ? <Badge tone="blue">Premium</Badge> : <Badge>Free plan</Badge>}{" "}
            {data ? `${activeCount} of ${data.activeJobLimit} active job${data.activeJobLimit === 1 ? "" : "s"}` : null}
          </p>
        </div>
        <Link to="/employer/jobs/new" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Post a job
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs font-medium uppercase text-slate-500">Promotion credits</p>
          <p className="mt-1 text-2xl font-semibold">{formatCents(company.creditBalanceCents)}</p>
          <Link to="/employer/billing" className="mt-2 inline-block text-sm font-semibold text-accent">
            Add credits →
          </Link>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase text-slate-500">Plan</p>
          <p className="mt-1 text-2xl font-semibold">{company.plan === "premium" ? "Premium" : "Free"}</p>
          <Link to="/employer/billing" className="mt-2 inline-block text-sm font-semibold text-accent">
            {company.plan === "premium" ? "Manage plan →" : "Upgrade for more active jobs →"}
          </Link>
        </Card>
      </div>

      {error ? <div className="mt-6"><Alert>{error}</Alert></div> : null}

      <Card className="mt-6 overflow-hidden p-0 sm:p-0">
        <h2 className="border-b border-slate-200 px-5 py-4 text-lg font-semibold">Your jobs</h2>
        {data && data.jobs.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-600">
            No jobs yet.{" "}
            <Link to="/employer/jobs/new" className="font-semibold text-accent">
              Post your first job
            </Link>
          </p>
        ) : null}
        <ul className="divide-y divide-slate-200">
          {data?.jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <Link to={`/employer/jobs/${job.id}`} className="font-semibold hover:text-accent">
                  {job.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <Badge tone={stateBadge[job.state].tone}>{stateBadge[job.state].label}</Badge>
                  {job.expiresAt && job.state === "published" ? <span>Expires {new Date(job.expiresAt).toLocaleDateString()}</span> : null}
                </div>
              </div>
              <dl className="flex gap-5 text-center text-xs text-slate-600">
                <div>
                  <dt>Views</dt>
                  <dd className="text-base font-semibold text-slate-950">{job.stats?.views ?? 0}</dd>
                </div>
                {job.stats?.applications != null ? (
                  <div>
                    <dt>Applicants</dt>
                    <dd className="text-base font-semibold text-slate-950">{job.stats.applications}</dd>
                  </div>
                ) : null}
                {job.stats?.clicks != null ? (
                  <div>
                    <dt>Sponsored clicks</dt>
                    <dd className="text-base font-semibold text-slate-950">{job.stats.clicks}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Company profile</h2>
          <button type="button" className="text-sm font-semibold text-accent" onClick={() => setEditingCompany((value) => !value)}>
            {editingCompany ? "Cancel" : "Edit"}
          </button>
        </div>
        {editingCompany ? (
          <div className="mt-4">
            <CompanyForm
              company={company}
              onSaved={() => {
                setEditingCompany(false);
                void refresh();
              }}
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">{company.description ?? "Add a short description so candidates know who you are."}</p>
        )}
      </Card>
    </PageContainer>
  );
}
