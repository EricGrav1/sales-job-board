import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "../../components/Layout";
import { Alert, Button, Card, SelectField, TextAreaField, TextField, readApiError, type FieldErrors } from "../../components/ui";
import { COMP_TYPES, EMPLOYMENT_TYPES, JOB_CATEGORIES, JOB_DESCRIPTION_MIN, JOB_LEVELS, WORKPLACES } from "../../../../shared/jobs";
import { ApiError, apiRequest } from "../../lib/api";
import type { EmployerJob } from "../../lib/jobs";

type FormState = Record<
  "title" | "category" | "level" | "employmentType" | "workplace" | "location" | "compType" | "baseMin" | "baseMax" | "oteMin" | "oteMax" | "description" | "applyUrl",
  string
> & { applyMethod: "platform" | "external" };

const blank: FormState = {
  title: "",
  category: "",
  level: "",
  employmentType: "full_time",
  workplace: "",
  location: "",
  compType: "base_plus_commission",
  baseMin: "",
  baseMax: "",
  oteMin: "",
  oteMax: "",
  description: "",
  applyMethod: "platform",
  applyUrl: ""
};

function fromJob(job: EmployerJob): FormState {
  const text = (value: string | number | null) => (value == null ? "" : String(value));
  return {
    title: job.title,
    category: text(job.category),
    level: text(job.level),
    employmentType: text(job.employmentType),
    workplace: text(job.workplace),
    location: text(job.location),
    compType: text(job.compType),
    baseMin: text(job.baseMin),
    baseMax: text(job.baseMax),
    oteMin: text(job.oteMin),
    oteMax: text(job.oteMax),
    description: text(job.description),
    applyMethod: job.applyMethod,
    applyUrl: text(job.applyUrl)
  };
}

function toPayload(form: FormState) {
  const money = (value: string) => {
    const digits = value.replace(/[^0-9]/g, "");
    return digits ? Number(digits) : null;
  };
  const text = (value: string) => value.trim() || null;
  return {
    title: form.title.trim(),
    category: text(form.category),
    level: text(form.level),
    employmentType: text(form.employmentType),
    workplace: text(form.workplace),
    location: text(form.location),
    compType: text(form.compType),
    baseMin: form.compType === "commission_only" ? null : money(form.baseMin),
    baseMax: form.compType === "commission_only" ? null : money(form.baseMax),
    oteMin: form.compType === "salary_only" ? null : money(form.oteMin),
    oteMax: form.compType === "salary_only" ? null : money(form.oteMax),
    description: text(form.description),
    applyMethod: form.applyMethod,
    applyUrl: form.applyMethod === "external" ? text(form.applyUrl) : null
  };
}

export function JobFormPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  // Remember the draft's id after the first save, so a failed publish + retry updates it instead of creating a duplicate.
  const [savedId, setSavedId] = useState<string | undefined>(routeId);
  const id = savedId;
  const [form, setForm] = useState<FormState>(blank);
  const [job, setJob] = useState<EmployerJob | null>(null);
  const [loading, setLoading] = useState(Boolean(routeId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planLimit, setPlanLimit] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!routeId) return;
    apiRequest<{ job: EmployerJob }>(`/api/employer/jobs/${routeId}`)
      .then((response) => {
        setJob(response.job);
        setForm(fromJob(response.job));
      })
      .catch(() => setError("Couldn’t load this job."))
      .finally(() => setLoading(false));
  }, [routeId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(publish: boolean) {
    setSaving(true);
    setError(null);
    setPlanLimit(null);
    setFieldErrors({});
    try {
      const saved = await apiRequest<{ job: EmployerJob }>(id ? `/api/employer/jobs/${id}` : "/api/employer/jobs", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(toPayload(form))
      });
      setSavedId(saved.job.id);
      if (publish) {
        await apiRequest(`/api/employer/jobs/${saved.job.id}/publish`, { method: "POST" });
      }
      navigate(`/employer/jobs/${saved.job.id}`);
    } catch (caught) {
      const { message, fields } = readApiError(caught);
      if (caught instanceof ApiError && caught.status === 402) {
        setPlanLimit(message);
      } else {
        setError(Object.keys(fields).length ? "Fix the highlighted fields." : message);
      }
      setFieldErrors(fields);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save(true);
  }

  if (loading) return <PageContainer>Loading…</PageContainer>;

  const isLive = job?.state === "published";
  const showBase = form.compType !== "commission_only";
  const showOte = form.compType !== "salary_only";

  return (
    <PageContainer>
      <Link to="/employer" className="text-sm font-semibold text-accent">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{routeId ? "Edit job" : "Post a job"}</h1>
      <form onSubmit={handleSubmit} noValidate className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold">The role</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextField label="Job title" required maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} error={fieldErrors.title} placeholder="e.g. Enterprise Account Executive" />
              </div>
              <SelectField label="Role" placeholder="Select…" options={JOB_CATEGORIES} value={form.category} onChange={(e) => set("category", e.target.value)} error={fieldErrors.category} />
              <SelectField label="Level" placeholder="Select…" options={JOB_LEVELS} value={form.level} onChange={(e) => set("level", e.target.value)} error={fieldErrors.level} />
              <SelectField label="Job type" placeholder="Select…" options={EMPLOYMENT_TYPES} value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)} error={fieldErrors.employmentType} />
              <SelectField label="Workplace" placeholder="Select…" options={WORKPLACES} value={form.workplace} onChange={(e) => set("workplace", e.target.value)} error={fieldErrors.workplace} />
              <div className="sm:col-span-2">
                <TextField label="Location" maxLength={160} value={form.location} onChange={(e) => set("location", e.target.value)} error={fieldErrors.location} placeholder="e.g. Austin, TX or Remote (US)" />
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">Compensation</h2>
            <p className="mt-1 text-sm text-slate-600">Required. Salespeople skip listings that hide pay.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <SelectField label="Pay structure" options={COMP_TYPES} value={form.compType} onChange={(e) => set("compType", e.target.value)} error={fieldErrors.compType} />
              </div>
              {showBase ? (
                <>
                  <TextField label="Base salary from ($/yr)" inputMode="numeric" value={form.baseMin} onChange={(e) => set("baseMin", e.target.value)} error={fieldErrors.baseMin} placeholder="80,000" />
                  <TextField label="Base salary to ($/yr)" inputMode="numeric" value={form.baseMax} onChange={(e) => set("baseMax", e.target.value)} error={fieldErrors.baseMax} placeholder="95,000" />
                </>
              ) : null}
              {showOte ? (
                <>
                  <TextField label="OTE from ($/yr)" inputMode="numeric" value={form.oteMin} onChange={(e) => set("oteMin", e.target.value)} error={fieldErrors.oteMin} placeholder="160,000" hint="On-target earnings: base + commission at 100% of quota" />
                  <TextField label="OTE to ($/yr)" inputMode="numeric" value={form.oteMax} onChange={(e) => set("oteMax", e.target.value)} error={fieldErrors.oteMax} placeholder="190,000" />
                </>
              ) : null}
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">Description</h2>
            <div className="mt-4">
              <TextAreaField
                label="What the job is"
                rows={12}
                maxLength={10000}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                error={fieldErrors.description}
                hint={`At least ${JOB_DESCRIPTION_MIN} characters. Include quota, territory, ramp, and who they sell to. ${form.description.trim().length} so far.`}
              />
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">How candidates apply</h2>
            <fieldset className="mt-4 space-y-2 text-sm">
              <legend className="sr-only">Application method</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="applyMethod" checked={form.applyMethod === "platform"} onChange={() => set("applyMethod", "platform")} />
                Collect applications here (resume + contact info)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="applyMethod" checked={form.applyMethod === "external"} onChange={() => set("applyMethod", "external")} />
                Send candidates to our careers site
              </label>
            </fieldset>
            {form.applyMethod === "external" ? (
              <div className="mt-4">
                <TextField label="Application URL" type="url" placeholder="https://" value={form.applyUrl} onChange={(e) => set("applyUrl", e.target.value)} error={fieldErrors.applyUrl} />
              </div>
            ) : null}
          </Card>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          {planLimit ? (
            <Alert tone="info">
              {planLimit}{" "}
              <Link to="/employer/billing" className="font-semibold underline">
                See plans
              </Link>
            </Alert>
          ) : null}
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" disabled={saving} className="w-full">
            {isLive ? "Save changes" : "Save & publish"}
          </Button>
          {!isLive ? (
            <Button type="button" variant="secondary" disabled={saving} className="w-full" onClick={() => void save(false)}>
              Save as draft
            </Button>
          ) : null}
          <p className="text-xs text-slate-500">Listings stay live for 30 days. You can close or renew them anytime.</p>
        </aside>
      </form>
    </PageContainer>
  );
}
