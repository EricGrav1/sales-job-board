import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Alert, Button, Card, TextAreaField, TextField, readApiError, type FieldErrors } from "../../components/ui";
import { ApiError, apiRequest } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { JobDetail } from "../../lib/jobs";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

type MyApplications = { applications: Array<{ job: { slug: string }; status: string }> };

async function uploadResume(file: File) {
  const { uploadUrl, resumeKey } = await apiRequest<{ uploadUrl: string; resumeKey: string }>("/api/applications/resume-upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType: "application/pdf", sizeBytes: file.size })
  });
  // Straight to R2 via the presigned URL; the file never passes through our API server.
  const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file });
  if (!response.ok) {
    throw new Error("upload failed");
  }
  return resumeKey;
}

export function ApplySection({ job }: { job: JobDetail }) {
  const { user } = useAuth();
  const location = useLocation();
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);

  const isSeeker = user?.role === "rep" || user?.role === "admin";

  useEffect(() => {
    if (!isSeeker) return;
    apiRequest<MyApplications>("/api/applications")
      .then((data) => setAlreadyApplied(data.applications.some((application) => application.job.slug === job.slug)))
      .catch(() => undefined);
  }, [isSeeker, job.slug]);

  if (job.applyMethod === "external" && job.applyUrl) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Apply</h2>
        <p className="mt-2 text-sm text-slate-600">{job.company.name} takes applications on their own site.</p>
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Apply on company site ↗
        </a>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Apply</h2>
        <p className="mt-2 text-sm text-slate-600">Create a free account to apply. It takes about a minute.</p>
        <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Log in to apply
        </Link>
        <Link to="/signup" className="mt-2 block text-center text-sm font-semibold text-accent">
          New here? Sign up
        </Link>
      </Card>
    );
  }

  if (!isSeeker) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Apply</h2>
        <p className="mt-2 text-sm text-slate-600">You’re signed in as an employer. Use a job seeker account to apply.</p>
      </Card>
    );
  }

  if (done || alreadyApplied) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Application sent</h2>
        <p className="mt-2 text-sm text-slate-600">{job.company.name} has your application. Track it anytime.</p>
        <Link to="/dashboard/applications" className="mt-4 inline-block text-sm font-semibold text-accent">
          My applications →
        </Link>
      </Card>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      let resumeKey: string | null = null;
      if (resume) {
        try {
          resumeKey = await uploadResume(resume);
        } catch (caught) {
          setError(caught instanceof ApiError ? readApiError(caught).message : "Resume upload failed. Try again, or apply without a resume.");
          return;
        }
      }
      await apiRequest(`/api/jobs/${encodeURIComponent(job.slug)}/apply`, {
        method: "POST",
        body: JSON.stringify({ fullName, phone, linkedinUrl, coverNote, resumeKey })
      });
      setDone(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setAlreadyApplied(true);
        return;
      }
      const { message, fields } = readApiError(caught);
      setError(Object.keys(fields).length ? "Fix the highlighted fields." : message);
      setFieldErrors(fields);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFile(file: File | null) {
    setFieldErrors((current) => ({ ...current, resume: "" }));
    if (file && (file.type !== "application/pdf" || file.size > MAX_RESUME_BYTES)) {
      setFieldErrors((current) => ({ ...current, resume: "Resume must be a PDF under 5 MB" }));
      setResume(null);
      return;
    }
    setResume(file);
  }

  if (!open) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Apply</h2>
        <p className="mt-2 text-sm text-slate-600">Send your resume and a short note straight to the hiring team.</p>
        <Button className="mt-4 w-full" onClick={() => setOpen(true)}>
          Apply now
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Apply to {job.company.name}</h2>
      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        <TextField label="Full name" required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} error={fieldErrors.fullName} />
        <TextField label="Phone (optional)" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} error={fieldErrors.phone} />
        <TextField
          label="LinkedIn (optional)"
          type="url"
          placeholder="https://linkedin.com/in/…"
          value={linkedinUrl}
          onChange={(event) => setLinkedinUrl(event.target.value)}
          error={fieldErrors.linkedinUrl}
        />
        <label className="block text-sm font-medium text-slate-800">
          Resume (PDF, optional)
          <input
            type="file"
            accept="application/pdf"
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold"
            onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          />
          {fieldErrors.resume ? <span className="mt-1 block text-xs font-medium text-red-700">{fieldErrors.resume}</span> : null}
        </label>
        <TextAreaField
          label="Why you’re a fit (optional)"
          rows={5}
          maxLength={3000}
          placeholder="Your numbers speak loudest: attainment, rank, deal sizes."
          value={coverNote}
          onChange={(event) => setCoverNote(event.target.value)}
          error={fieldErrors.coverNote}
        />
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Sending…" : "Submit application"}
        </Button>
      </form>
    </Card>
  );
}
