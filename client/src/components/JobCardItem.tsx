import { Link } from "react-router-dom";
import { JOB_LEVELS, WORKPLACES, labelFor } from "../../../shared/jobs";
import { formatPay, timeAgo, type JobCard } from "../lib/jobs";
import { Badge } from "./ui";

export function JobCardItem({ job, sponsored = false, onOpen }: { job: JobCard; sponsored?: boolean; onOpen?: () => void }) {
  return (
    <li className={`rounded-lg border bg-white p-4 sm:p-5 ${sponsored ? "border-amber-300" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {sponsored ? <Badge tone="amber">Sponsored</Badge> : null}
        {job.company.premium ? <Badge tone="blue">Premium employer</Badge> : null}
      </div>
      <h3 className="mt-1 text-lg font-semibold leading-snug">
        <Link to={`/jobs/${job.slug}`} onClick={onOpen} className="hover:text-accent">
          {job.title}
        </Link>
      </h3>
      <p className="text-sm text-slate-700">{job.company.name}</p>
      <p className="mt-2 text-sm font-semibold text-emerald-800">{formatPay(job)}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
        <span>{labelFor(JOB_LEVELS, job.level)}</span>
        <span aria-hidden="true">·</span>
        <span>{labelFor(WORKPLACES, job.workplace)}</span>
        <span aria-hidden="true">·</span>
        <span>{job.location}</span>
        <span aria-hidden="true">·</span>
        <span>{timeAgo(job.publishedAt)}</span>
      </div>
    </li>
  );
}
