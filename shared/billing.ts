// Credit packs employers can buy for sponsored jobs (cents). Server rejects any other amount.
export const CREDIT_PACKS_CENTS = [5000, 10000, 25000, 50000] as const;
export type CreditPackCents = (typeof CREDIT_PACKS_CENTS)[number];
