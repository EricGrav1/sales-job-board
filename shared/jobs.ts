// Job taxonomy shared by server (enums, validation) and client (labels, filters).
// Keep this file free of server-only imports so the client can bundle it.

export const JOB_CATEGORIES = [
  { value: "sdr_bdr", label: "SDR / BDR" },
  { value: "account_executive", label: "Account Executive" },
  { value: "account_manager", label: "Account Manager" },
  { value: "customer_success", label: "Customer Success" },
  { value: "sales_engineer", label: "Sales Engineer" },
  { value: "sales_operations", label: "Sales / Revenue Operations" },
  { value: "channel_partnerships", label: "Channel & Partnerships" },
  { value: "sales_management", label: "Sales Management" },
  { value: "sales_leadership", label: "Sales Leadership" },
  { value: "other", label: "Other sales role" }
] as const;

export const JOB_LEVELS = [
  { value: "entry", label: "Entry level" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "vp", label: "VP" },
  { value: "executive", label: "Executive (CRO / C-level)" }
] as const;

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" }
] as const;

export const WORKPLACES = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" }
] as const;

export const COMP_TYPES = [
  { value: "base_plus_commission", label: "Base + commission" },
  { value: "commission_only", label: "Commission only" },
  { value: "salary_only", label: "Salary only" }
] as const;

type Values<T extends ReadonlyArray<{ value: string }>> = { [K in keyof T]: T[K] extends { value: infer V } ? V : never };

export const jobCategoryValues = JOB_CATEGORIES.map((option) => option.value) as unknown as Values<typeof JOB_CATEGORIES>;
export const jobLevelValues = JOB_LEVELS.map((option) => option.value) as unknown as Values<typeof JOB_LEVELS>;
export const employmentTypeValues = EMPLOYMENT_TYPES.map((option) => option.value) as unknown as Values<typeof EMPLOYMENT_TYPES>;
export const workplaceValues = WORKPLACES.map((option) => option.value) as unknown as Values<typeof WORKPLACES>;
export const compTypeValues = COMP_TYPES.map((option) => option.value) as unknown as Values<typeof COMP_TYPES>;

export type JobCategory = (typeof JOB_CATEGORIES)[number]["value"];
export type JobLevel = (typeof JOB_LEVELS)[number]["value"];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]["value"];
export type Workplace = (typeof WORKPLACES)[number]["value"];
export type CompType = (typeof COMP_TYPES)[number]["value"];

export const JOB_LISTING_DAYS = 30;
export const JOB_DESCRIPTION_MIN = 100;
export const JOB_DESCRIPTION_MAX = 10000;
export const JOBS_PAGE_SIZE = 20;

export function labelFor(options: ReadonlyArray<{ value: string; label: string }>, value: string | null | undefined) {
  return options.find((option) => option.value === value)?.label ?? "";
}
