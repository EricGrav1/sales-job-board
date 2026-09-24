import { Card } from "../../components/ui";
import type { JobDetail } from "../../lib/jobs";

export function ApplySection({ job }: { job: JobDetail }) {
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

  return (
    <Card>
      <h2 className="text-lg font-semibold">Apply</h2>
      <p className="mt-2 text-sm text-slate-600">Applications for this job are coming soon.</p>
    </Card>
  );
}
