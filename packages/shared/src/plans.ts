// Display copy for plans. Prices / durations / limits are authoritative in the
// `plans` table (the database enforces them) - read them from there at runtime.
export type PlanId = 'free' | 'basic' | 'premium';

export const PLAN_DEFAULTS: Record<PlanId, { pricePkr: number; durationDays: number; dailyInterestLimit: number }> = {
  free: { pricePkr: 0, durationDays: 0, dailyInterestLimit: 0 },
  basic: { pricePkr: 4000, durationDays: 90, dailyInterestLimit: 10 },
  premium: { pricePkr: 8500, durationDays: 90, dailyInterestLimit: 25 },
};

export const formatPkr = (amount: number) => `PKR ${amount.toLocaleString('en-PK')}`;
