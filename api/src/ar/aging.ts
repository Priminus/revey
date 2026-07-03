export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export const AGING_BUCKETS: AgingBucket[] = [
  'current',
  '1-30',
  '31-60',
  '61-90',
  '90+',
];

const DAY_MS = 86_400_000;

export function overdueDays(dueDate: Date, asOf: Date): number {
  return Math.floor((asOf.getTime() - dueDate.getTime()) / DAY_MS);
}

export function bucketFor(dueDate: Date, asOf: Date): AgingBucket {
  const days = overdueDays(dueDate, asOf);
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export function summarizeAging(
  items: { dueDate: Date; amountDueCents: number }[],
  asOf: Date,
): Record<AgingBucket, { count: number; amountCents: number }> {
  const out = {} as Record<AgingBucket, { count: number; amountCents: number }>;
  for (const b of AGING_BUCKETS) out[b] = { count: 0, amountCents: 0 };
  for (const item of items) {
    const b = bucketFor(item.dueDate, asOf);
    out[b].count += 1;
    out[b].amountCents += item.amountDueCents;
  }
  return out;
}
