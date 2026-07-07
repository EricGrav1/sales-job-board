import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, apiRequest, type PublicProfileResponse, type VerificationTier } from "../lib/api";

const badgeLabels: Record<VerificationTier, string> = {
  unverified: "Unverified",
  self_reported: "Self reported",
  verified: "Verified"
};

const roleLabels: Record<string, string> = {
  sdr: "SDR",
  ae: "Account Executive",
  am: "Account Manager",
  field: "Field Sales",
  inside: "Inside Sales",
  manager: "Sales Manager",
  other: "Sales"
};

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

function oteRange(min: number | null, max: number | null) {
  const values = [formatMoney(min), formatMoney(max)].filter(Boolean);
  return values.length > 0 ? values.join(" - ") : "OTE not listed";
}

export function PublicProfilePage() {
  const { slug } = useParams();
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    apiRequest<PublicProfileResponse>(`/api/r/${encodeURIComponent(slug)}`)
      .then((response) => {
        if (isMounted) {
          setData(response);
        }
      })
      .catch((requestError) => {
        if (!isMounted) {
          return;
        }
        if (requestError instanceof ApiError && requestError.status === 404) {
          setNotFound(true);
        } else {
          setError("Unable to load this profile.");
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
  }, [slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
        <div className="mx-auto max-w-6xl text-sm font-medium text-slate-600">Loading profile...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8">
          <h1 className="text-3xl font-semibold">{error}</h1>
        </section>
      </main>
    );
  }

  if (notFound || !data) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8">
          <Link className="text-sm font-semibold text-accent" to="/">
            Sales Job Board
          </Link>
          <h1 className="mt-6 text-3xl font-semibold">Profile not found</h1>
          <p className="mt-3 text-slate-600">This rep profile is not published or does not exist.</p>
        </section>
      </main>
    );
  }

  const { profile, records, proofs } = data;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link className="text-sm font-semibold text-slate-950" to="/">
            Sales Job Board
          </Link>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-accent">
            {badgeLabels[profile.verificationTier]}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <section className="grid gap-6 border-b border-slate-200 pb-8 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="text-sm font-semibold text-accent">
              {profile.roleType ? roleLabels[profile.roleType] : "Sales representative"}
            </p>
            <h1 className="mt-3 max-w-4xl text-5xl font-semibold leading-tight">{profile.displayName}</h1>
            {profile.headline ? <p className="mt-4 max-w-3xl text-xl leading-8 text-slate-700">{profile.headline}</p> : null}
            {profile.bio ? <p className="mt-6 max-w-3xl leading-7 text-slate-700">{profile.bio}</p> : null}
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Profile signal</p>
            <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-4">
              <p className="text-2xl font-semibold text-accent">{badgeLabels[profile.verificationTier]}</p>
              <p className="mt-1 text-sm text-slate-600">Verification tier</p>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">OTE</dt>
                <dd className="text-right font-semibold">{oteRange(profile.oteMin, profile.oteMax)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Location</dt>
                <dd className="text-right font-semibold">{profile.location ?? "Not listed"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Remote</dt>
                <dd className="text-right font-semibold">{profile.remoteOk ? "Open" : "Not listed"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Experience</dt>
                <dd className="text-right font-semibold">
                  {profile.yearsExperience == null ? "Not listed" : `${profile.yearsExperience} years`}
                </dd>
              </div>
            </dl>
          </aside>
        </section>

        {profile.industries.length > 0 ? (
          <section className="border-b border-slate-200 py-6">
            <div className="flex flex-wrap gap-2">
              {profile.industries.map((industry) => (
                <span key={industry} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700">
                  {industry}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 py-8 lg:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Performance records</h2>
              <span className="text-sm font-medium text-slate-500">{records.length} records</span>
            </div>

            {records.length > 0 ? (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-3 font-semibold">Period</th>
                      <th className="py-3 font-semibold">Attainment</th>
                      <th className="py-3 font-semibold">Rank</th>
                      <th className="py-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((record) => (
                      <tr key={record.id}>
                        <td className="py-3 font-medium">{record.periodLabel}</td>
                        <td className="py-3">{record.quotaAttainmentPct == null ? "-" : `${record.quotaAttainmentPct}%`}</td>
                        <td className="py-3">
                          {record.rank && record.teamSize ? `${record.rank} of ${record.teamSize}` : "-"}
                        </td>
                        <td className="py-3 text-slate-600">{record.notes ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5 rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-medium text-slate-500">
                Performance records placeholder
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Approved proofs</h2>
              <span className="text-sm font-medium text-slate-500">{proofs.length} items</span>
            </div>

            {proofs.length > 0 ? (
              <div className="mt-5 grid gap-3">
                {proofs.map((proof) => (
                  <div key={proof.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <p className="font-semibold capitalize">{proof.type}</p>
                    <p className="mt-1 text-sm text-slate-500">Approved proof</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-medium text-slate-500">
                Proof gallery placeholder
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
