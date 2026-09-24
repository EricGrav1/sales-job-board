import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "../../components/Layout";
import { Alert, Badge, Card } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import { formatPay, type JobCard } from "../../lib/jobs";

type ApplicationStatus = "new" | "reviewed" | "interviewing" | "offer" | "hired" | "rejected";

type MyApplication = {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  job: JobCard & { open: boolean };
};

export const statusBadge: Record<ApplicationStatus, { label: string; tone: "slate" | "blue" | "amber" | "green" | "red" }> = {
  new: { label: "Submitted", tone: "slate" },
  reviewed: { label: "Reviewed", tone: "blue" },
  interviewing: { label: "Interviewing", tone: "amber" },
  offer: { label: "Offer", tone: "green" },
  hired: { label: "Hired", tone: "green" },
  rejected: { label: "Not selected", tone: "red" }
};

export function MyApplicationsPage() {
  const [items, setItems] = useState<MyApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ applications: MyApplication[] }>("/api/applications")
      .then((data) => setItems(data.applications))
      .catch(() => setError("Couldn’t load your applications."));
  }, []);

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">My applications</h1>
      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
      {items && items.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm text-slate-600">
            You haven’t applied to anything yet.{" "}
            <Link to="/jobs" className="font-semibold text-accent">
              Browse sales jobs
            </Link>
          </p>
        </Card>
      ) : null}
      <ul className="mt-6 space-y-3">
        {items?.map((application) => (
          <li key={application.id} className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                {application.job.open ? (
                  <Link to={`/jobs/${application.job.slug}`} className="font-semibold hover:text-accent">
                    {application.job.title}
                  </Link>
                ) : (
                  <span className="font-semibold">{application.job.title}</span>
                )}
                <p className="text-sm text-slate-700">{application.job.company.name}</p>
                <p className="mt-1 text-sm text-emerald-800">{formatPay(application.job)}</p>
              </div>
              <Badge tone={statusBadge[application.status].tone}>{statusBadge[application.status].label}</Badge>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Applied {new Date(application.createdAt).toLocaleDateString()}
              {application.job.open ? "" : " · listing closed"}
            </p>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
