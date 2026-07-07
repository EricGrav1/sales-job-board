import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  apiRequest,
  type OwnProfileResponse,
  type Profile,
  type ProfilePayload,
  type RoleType
} from "../lib/api";

type ProfileFormState = {
  displayName: string;
  headline: string;
  bio: string;
  roleType: RoleType | "";
  industries: string;
  yearsExperience: string;
  oteMin: string;
  oteMax: string;
  location: string;
  remoteOk: boolean;
};

const blankForm: ProfileFormState = {
  displayName: "",
  headline: "",
  bio: "",
  roleType: "",
  industries: "",
  yearsExperience: "",
  oteMin: "",
  oteMax: "",
  location: "",
  remoteOk: false
};

const roleTypeOptions: Array<{ value: RoleType; label: string }> = [
  { value: "sdr", label: "SDR" },
  { value: "ae", label: "Account Executive" },
  { value: "am", label: "Account Manager" },
  { value: "field", label: "Field Sales" },
  { value: "inside", label: "Inside Sales" },
  { value: "manager", label: "Sales Manager" },
  { value: "other", label: "Other" }
];

function formFromProfile(profile: Profile | null): ProfileFormState {
  if (!profile) {
    return blankForm;
  }

  return {
    displayName: profile.displayName,
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    roleType: profile.roleType ?? "",
    industries: profile.industries.join(", "),
    yearsExperience: profile.yearsExperience?.toString() ?? "",
    oteMin: profile.oteMin?.toString() ?? "",
    oteMax: profile.oteMax?.toString() ?? "",
    location: profile.location ?? "",
    remoteOk: profile.remoteOk
  };
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function payloadFromForm(form: ProfileFormState): ProfilePayload {
  return {
    displayName: form.displayName.trim(),
    headline: textOrNull(form.headline),
    bio: textOrNull(form.bio),
    roleType: form.roleType || null,
    industries: form.industries
      .split(",")
      .map((industry) => industry.trim())
      .filter(Boolean),
    yearsExperience: numberOrNull(form.yearsExperience),
    oteMin: numberOrNull(form.oteMin),
    oteMax: numberOrNull(form.oteMax),
    location: textOrNull(form.location),
    remoteOk: form.remoteOk
  };
}

function formatMoney(value: number | null | undefined) {
  if (value == null) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function fieldErrorsFrom(error: unknown) {
  if (!(error instanceof ApiError) || !error.data || typeof error.data !== "object") {
    return {};
  }

  const data = error.data as { fields?: Record<string, string[]>; reasons?: Record<string, string> };
  if (data.fields) {
    return Object.fromEntries(Object.entries(data.fields).map(([key, value]) => [key, value.join(", ")]));
  }

  return data.reasons ?? {};
}

export function ProfileEditPage() {
  const [form, setForm] = useState<ProfileFormState>(blankForm);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    apiRequest<OwnProfileResponse>("/api/profile")
      .then((data) => {
        if (!isMounted) {
          return;
        }
        setProfile(data.profile);
        setForm(formFromProfile(data.profile));
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          setPageError("Sign in to edit your profile.");
        } else if (error instanceof ApiError && error.status === 403) {
          setPageError("Verify your email before editing your profile.");
        } else {
          setPageError("Unable to load your profile.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const completeness = useMemo(() => {
    const required = [form.displayName, form.headline, form.roleType, form.location];
    const completed = required.filter((value) => String(value).trim().length > 0).length;
    return Math.round((completed / required.length) * 100);
  }, [form.displayName, form.headline, form.location, form.roleType]);

  async function saveProfile() {
    setSaving(true);
    setStatusMessage(null);
    setFieldErrors({});

    try {
      const data = await apiRequest<{ profile: Profile }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify(payloadFromForm(form))
      });
      setProfile(data.profile);
      setForm(formFromProfile(data.profile));
      setStatusMessage("Profile saved.");
      return data.profile;
    } catch (error) {
      setFieldErrors(fieldErrorsFrom(error));
      setStatusMessage("Profile could not be saved.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveProfile();
  }

  async function handlePublish() {
    setPublishing(true);
    setStatusMessage(null);
    setFieldErrors({});

    try {
      const data = await apiRequest<{ profile: Profile }>("/api/profile/publish", {
        method: "POST",
        body: JSON.stringify({})
      });
      setProfile(data.profile);
      setStatusMessage("Profile published.");
    } catch (error) {
      setFieldErrors(fieldErrorsFrom(error));
      setStatusMessage("Profile is missing required publishing fields.");
    } finally {
      setPublishing(false);
    }
  }

  function setField<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const oteRange =
    profile?.oteMin != null || profile?.oteMax != null
      ? [formatMoney(profile?.oteMin), formatMoney(profile?.oteMax)].filter(Boolean).join(" - ")
      : "Not set";

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
        <div className="mx-auto max-w-6xl text-sm font-medium text-slate-600">Loading profile...</div>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
        <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8">
          <Link className="text-sm font-semibold text-accent" to="/">
            Sales Job Board
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">{pageError}</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link className="text-sm font-semibold text-slate-950" to="/">
            Sales Job Board
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {profile?.slug ? (
              <Link className="font-medium text-accent" to={`/r/${profile.slug}`}>
                Public profile
              </Link>
            ) : null}
            <Link className="font-medium text-slate-600" to="/dashboard">
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Publish readiness</p>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-4xl font-semibold">{completeness}%</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  profile?.isPublished ? "bg-blue-50 text-accent" : "bg-slate-100 text-slate-600"
                }`}
              >
                {profile?.isPublished ? "Published" : "Draft"}
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-accent" style={{ width: `${completeness}%` }} />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Verification badge</p>
            <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-4">
              <p className="text-lg font-semibold capitalize text-accent">
                {(profile?.verificationTier ?? "unverified").replace("_", " ")}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Profile snapshot</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Slug</dt>
                <dd className="text-right font-medium text-slate-900">{profile?.slug ?? "Save to generate"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">OTE</dt>
                <dd className="text-right font-medium text-slate-900">{oteRange}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Location</dt>
                <dd className="text-right font-medium text-slate-900">{profile?.location ?? "Not set"}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <form className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-accent">Profile editor</p>
              <h1 className="mt-2 text-3xl font-semibold">Edit rep profile</h1>
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={publishing}
                onClick={handlePublish}
                type="button"
              >
                {publishing ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>

          {statusMessage ? <p className="mt-4 text-sm font-medium text-slate-700">{statusMessage}</p> : null}

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Display name</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                value={form.displayName}
                onChange={(event) => setField("displayName", event.target.value)}
              />
              {fieldErrors.displayName ? <span className="text-sm text-red-600">{fieldErrors.displayName}</span> : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Headline</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                maxLength={120}
                value={form.headline}
                onChange={(event) => setField("headline", event.target.value)}
              />
              {fieldErrors.headline ? <span className="text-sm text-red-600">{fieldErrors.headline}</span> : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Role type</span>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                value={form.roleType}
                onChange={(event) => setField("roleType", event.target.value as RoleType | "")}
              >
                <option value="">Select role</option>
                {roleTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {fieldErrors.roleType ? <span className="text-sm text-red-600">{fieldErrors.roleType}</span> : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Location</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                value={form.location}
                onChange={(event) => setField("location", event.target.value)}
              />
              {fieldErrors.location ? <span className="text-sm text-red-600">{fieldErrors.location}</span> : null}
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Bio</span>
              <textarea
                className="min-h-32 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                value={form.bio}
                onChange={(event) => setField("bio", event.target.value)}
              />
              <div className="flex justify-between text-sm">
                {fieldErrors.bio ? <span className="text-red-600">{fieldErrors.bio}</span> : <span />}
                <span className="text-slate-500">{form.bio.length}/2000</span>
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Industries</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                value={form.industries}
                onChange={(event) => setField("industries", event.target.value)}
              />
              {fieldErrors.industries ? <span className="text-sm text-red-600">{fieldErrors.industries}</span> : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Years experience</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                min={0}
                max={60}
                type="number"
                value={form.yearsExperience}
                onChange={(event) => setField("yearsExperience", event.target.value)}
              />
              {fieldErrors.yearsExperience ? (
                <span className="text-sm text-red-600">{fieldErrors.yearsExperience}</span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">OTE minimum</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                min={0}
                type="number"
                value={form.oteMin}
                onChange={(event) => setField("oteMin", event.target.value)}
              />
              {fieldErrors.oteMin ? <span className="text-sm text-red-600">{fieldErrors.oteMin}</span> : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">OTE maximum</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                min={0}
                type="number"
                value={form.oteMax}
                onChange={(event) => setField("oteMax", event.target.value)}
              />
              {fieldErrors.oteMax ? <span className="text-sm text-red-600">{fieldErrors.oteMax}</span> : null}
            </label>

            <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-slate-700">Open to remote</span>
              </span>
              <input
                checked={form.remoteOk}
                className="h-5 w-5 accent-blue-600"
                type="checkbox"
                onChange={(event) => setField("remoteOk", event.target.checked)}
              />
            </label>
          </div>
        </form>
      </div>
    </main>
  );
}
