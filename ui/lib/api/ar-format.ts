// Pure formatting/constants for AR data — no Clerk import here so components
// that only need display helpers (e.g. AgingChart) can be tested without
// mocking @clerk/nextjs.

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';
export const AGING_BUCKETS: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];

export function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
