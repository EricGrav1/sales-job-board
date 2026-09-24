import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Card, SelectField } from "../../components/ui";
import { apiRequest } from "../../lib/api";

type Applicant = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  coverNote: string | null;
  status: string;
  hasResume: boolean;
  createdAt: string;
  profile: { slug: string; displayName: string; headline: string | null; verificationTier: string } | null;
};

const statusOptions = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" }
];

export function ApplicantsPanel({ jobId }: { jobId: string }) {
  const [applicants, setApplicants] = useState<Applicant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiRequest<{ applications: Applicant[] }>(`/api/employer/jobs/${jobId}/applications`)
      .then((data) => setApplicants(data.applications))
      .catch(() => setError("Couldn’t load applicants."));
  }, [jobId]);

  useEffect(load, [load]);

  async function updateStatus(applicant: Applicant, status: string) {
    setApplicants((current) => current?.map((item) => (item.id === applicant.id ? { ...item, status } : item)) ?? null);
    try {
      await apiRequest(`/api/employer/applications/${applicant.id}`, { method: "PUT", body: JSON.stringify({ status }) });
    } catch {
      setError("Couldn’t update status.");
      load();
    }
  }

  async function openResume(applicant: Applicant) {
    // Open the tab synchronously (popup blockers), then point it at the short-lived signed URL.
    const tab = window.open("", "_blank");
    try {
      const { url } = await apiRequest<{ url: string }>(`/api/employer/applications/${applicant.id}/resume`);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      }
    } catch {
      tab?.close();
      setError("Couldn’t open that resume.");
    }
  }

  return (
    <Card className="p-0 sm:p-0">
      <h2 className="border-b border-slate-200 px-5 py-4 text-lg font-semibold">
        Applicants {applicants ? <span className="text-slate-500">({applicants.length})</span> : null}
      </h2>
      {error ? <div className="px-5 pt-4"><Alert>{error}</Alert></div> : null}
      {applicants && applicants.length === 0 ? <p className="px-5 py-6 text-sm text-slate-600">No applicants yet.</p> : null}
      <ul className="divide-y divide-slate-200">
        {applicants?.map((applicant) => (
          <li key={applicant.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_180px]">
            <div className="min-w-0">
              <p className="font-semibold">{applicant.fullName}</p>
              <p className="break-all text-sm text-slate-700">
                <a href={`mailto:${applicant.email}`} className="hover:text-accent">
                  {applicant.email}
                </a>
                {applicant.phone ? ` · ${applicant.phone}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
                {applicant.hasResume ? (
                  <button type="button" className="text-accent" onClick={() => void openResume(applicant)}>
                    Resume (PDF)
                  </button>
                ) : null}
                {applicant.linkedinUrl ? (
                  <a href={applicant.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-accent">
                    LinkedIn ↗
                  </a>
                ) : null}
                {applicant.profile ? (
                  <a href={`/r/${applicant.profile.slug}`} target="_blank" rel="noopener noreferrer" className="text-accent">
                    Sales profile ↗
                  </a>
                ) : null}
                {applicant.profile?.verificationTier === "verified" ? <Badge tone="green">Verified numbers</Badge> : null}
              </div>
              {applicant.coverNote ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{applicant.coverNote}</p> : null}
              <p className="mt-2 text-xs text-slate-500">Applied {new Date(applicant.createdAt).toLocaleDateString()}</p>
            </div>
            <SelectField label="Status" options={statusOptions} value={applicant.status} onChange={(event) => void updateStatus(applicant, event.target.value)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
