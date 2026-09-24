import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

const levels = [
  { value: "entry", label: "SDR / BDR" },
  { value: "mid", label: "Account Executive" },
  { value: "senior", label: "Senior / Enterprise" },
  { value: "manager", label: "Sales Manager" },
  { value: "director", label: "Director" },
  { value: "vp", label: "VP of Sales" },
  { value: "executive", label: "CRO / Executive" }
];

export function LandingPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    navigate(`/jobs${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <div>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Built for salespeople</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Sales jobs from SDR to CRO.</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-700">
            Every listing shows base and OTE up front. No guessing what the comp plan looks like.
          </p>
          <form onSubmit={handleSearch} className="mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row" role="search">
            <label htmlFor="landing-search" className="sr-only">
              Search sales jobs
            </label>
            <input
              id="landing-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, company, or keyword, e.g. “SaaS AE”"
              className="w-full rounded-md border border-slate-300 px-4 py-3 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <button type="submit" className="rounded-md bg-accent px-6 py-3 font-semibold text-white hover:bg-blue-700">
              Search jobs
            </button>
          </form>
          <div className="mt-6 flex flex-wrap gap-2">
            {levels.map((level) => (
              <Link
                key={level.value}
                to={`/jobs?level=${level.value}`}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:border-accent hover:text-accent"
              >
                {level.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Looking for your next sales role?</h2>
          <p className="mt-2 text-sm text-slate-600">Free for job seekers. Filter by level, OTE, and remote, then apply in minutes.</p>
          <Link to="/jobs" className="mt-4 inline-block text-sm font-semibold text-accent">
            Browse jobs →
          </Link>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Hiring salespeople?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Post a job for free and reach people who only want sales roles. Promote it with a daily budget you control.
          </p>
          <Link to="/signup?type=employer" className="mt-4 inline-block text-sm font-semibold text-accent">
            Post a job →
          </Link>
        </div>
      </section>
    </div>
  );
}
