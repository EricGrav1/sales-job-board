import type { Company } from "../../shared/schema";

export type PlanName = Company["plan"];

export const PLANS = {
  free: { activeJobLimit: 1, premiumBadge: false },
  premium: { activeJobLimit: 25, premiumBadge: true }
} as const satisfies Record<PlanName, { activeJobLimit: number; premiumBadge: boolean }>;

export function planFor(company: Pick<Company, "plan">) {
  return PLANS[company.plan];
}
