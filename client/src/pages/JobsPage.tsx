import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { JobCardItem } from "../components/JobCardItem";
import { PageContainer } from "../components/Layout";
import { Alert, Button, SelectField, TextField } from "../components/ui";
import { EMPLOYMENT_TYPES, JOB_CATEGORIES, JOB_LEVELS, WORKPLACES } from "../../../shared/jobs";
import { apiRequest } from "../lib/api";
import { recordSponsoredClick } from "../lib/sponsored";
import type { JobSearchResponse } from "../lib/jobs";

const oteOptions = [50000, 75000, 100000, 150000, 200000, 250000, 300000].map((value) => ({
  value: String(value),
  label: `$${value / 1000}k+`
}));

const filterKeys = ["q", "location", "category", "level", "workplace", "employmentType", "minOte"] as const;

export function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<JobSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ q: searchParams.get("q") ?? "", location: searchParams.get("location") ?? "" });
  const queryString = searchParams.toString();

  useEffect(() => {
    let active = true;
    setError(null);
    apiRequest<JobSearchResponse>(`/api/jobs${queryString ? `?${queryString}` : ""}`)
      .then((response) => active && setData(response))
      .catch(() => active && setError("Couldn’t load jobs. Please try again."));
    return () => {
      active = false;
    };
  }, [queryString]);

  function updateParams(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    setSearchParams(next);
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    updateParams({ q: draft.q.trim(), location: draft.location.trim() });
  }

  const page = Number(searchParams.get("page") ?? "1");
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = filterKeys.some((key) => searchParams.get(key));

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
    window.scrollTo({ top: 0 });
  }

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">Sales jobs</h1>
      <form onSubmit={handleSearch} role="search" className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField label="Keyword" placeholder="Title, company, or skill" value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} />
        <TextField label="Location" placeholder="City, state, or “Remote”" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
        <Button type="submit">Search</Button>
      </form>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <SelectField label="Role" placeholder="All roles" options={JOB_CATEGORIES} value={searchParams.get("category") ?? ""} onChange={(event) => updateParams({ category: event.target.value })} />
        <SelectField label="Level" placeholder="All levels" options={JOB_LEVELS} value={searchParams.get("level") ?? ""} onChange={(event) => updateParams({ level: event.target.value })} />
        <SelectField label="Workplace" placeholder="Any" options={WORKPLACES} value={searchParams.get("workplace") ?? ""} onChange={(event) => updateParams({ workplace: event.target.value })} />
        <SelectField label="Job type" placeholder="Any" options={EMPLOYMENT_TYPES} value={searchParams.get("employmentType") ?? ""} onChange={(event) => updateParams({ employmentType: event.target.value })} />
        <SelectField label="Min OTE" placeholder="Any pay" options={oteOptions} value={searchParams.get("minOte") ?? ""} onChange={(event) => updateParams({ minOte: event.target.value })} />
      </div>

      {error ? <div className="mt-6"><Alert>{error}</Alert></div> : null}

      {data ? (
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <p aria-live="polite">
              {data.total} job{data.total === 1 ? "" : "s"}
            </p>
            {hasFilters ? (
              <button type="button" className="font-semibold text-accent" onClick={() => { setDraft({ q: "", location: "" }); setSearchParams(new URLSearchParams()); }}>
                Clear filters
              </button>
            ) : null}
          </div>
          <ul className="mt-3 space-y-3">
            {data.sponsored.map((job) => (
              <JobCardItem key={`sponsored-${job.id}`} job={job} sponsored onOpen={() => recordSponsoredClick(job)} />
            ))}
            {data.results.map((job) => (
              <JobCardItem key={job.id} job={job} />
            ))}
          </ul>
          {data.total === 0 && data.sponsored.length === 0 ? (
            <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
              No jobs match these filters yet. Try widening your search.
            </p>
          ) : null}
          {totalPages > 1 ? (
            <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
              <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                Next
              </Button>
            </nav>
          ) : null}
        </div>
      ) : !error ? (
        <p className="mt-6 text-sm text-slate-600">Loading jobs…</p>
      ) : null}
    </PageContainer>
  );
}
