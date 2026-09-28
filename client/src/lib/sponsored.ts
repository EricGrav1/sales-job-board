import type { JobCard } from "./jobs";

// Fire-and-forget: record a sponsored click without delaying navigation. keepalive lets the
// request finish even as the page changes.
export function recordSponsoredClick(job: JobCard) {
  if (!job.clickToken) {
    return;
  }
  void fetch(`/api/jobs/${encodeURIComponent(job.slug)}/click`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clickToken: job.clickToken })
  }).catch(() => undefined);
}
