import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageContainer } from "../components/Layout";
import { Alert, Badge, Card } from "../components/ui";
import { EMPLOYMENT_TYPES, JOB_CATEGORIES, JOB_LEVELS, WORKPLACES, labelFor } from "../../../shared/jobs";
import { ApiError, apiRequest } from "../lib/api";
import { formatPay, timeAgo, type JobDetail } from "../lib/jobs";
import { ApplySection } from "./seeker/ApplySection";

export function JobDetailPage() {
  const { slug } = useParams();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ job: JobDetail }>(`/api/jobs/${encodeURIComponent(slug ?? "")}`)
      .then((response) => active && setJob(response.job))
      .catch((caught) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 404) setNotFound(true);
        else setError("Couldn’t load this job.");
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (notFound) {
    return (
      <PageContainer narrow>
        <Card>
          <h1 className="text-xl font-semibold">This job is no longer available</h1>
          <p className="mt-2 text-sm text-slate-600">It may have been filled or closed.</p>
          <Link to="/jobs" className="mt-4 inline-block text-sm font-semibold text-accent">
            Browse open sales jobs →
          </Link>
        </Card>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer narrow>
        <Alert>{error}</Alert>
      </PageContainer>
    );
  }

  if (!job) {
    return <PageContainer>Loading…</PageContainer>;
  }

  const facts = [
    ["Role", labelFor(JOB_CATEGORIES, job.category)],
    ["Level", labelFor(JOB_LEVELS, job.level)],
    ["Workplace", labelFor(WORKPLACES, job.workplace)],
    ["Job type", labelFor(EMPLOYMENT_TYPES, job.employmentType)],
    ["Location", job.location]
  ];

  return (
    <PageContainer>
      <Link to="/jobs" className="text-sm font-semibold text-accent">
        ← All jobs
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            {job.company.premium ? <Badge tone="blue">Premium employer</Badge> : null}
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{job.title}</h1>
            <p className="mt-1 text-slate-700">{job.company.name}</p>
            <p className="mt-3 text-lg font-semibold text-emerald-800">{formatPay(job)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
                  <dd className="text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-slate-500">Posted {timeAgo(job.publishedAt).toLowerCase()}</p>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">About the role</h2>
            {/* Plain text only (SPEC §10): never render employer-supplied HTML. */}
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{job.description}</p>
          </Card>
          {job.company.description ? (
            <Card>
              <h2 className="text-lg font-semibold">About {job.company.name}</h2>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{job.company.description}</p>
              {job.company.website ? (
                <a href={job.company.website} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block text-sm font-semibold text-accent">
                  Company website ↗
                </a>
              ) : null}
            </Card>
          ) : null}
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ApplySection job={job} />
        </aside>
      </div>
    </PageContainer>
  );
}
