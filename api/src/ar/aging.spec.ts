import { overdueDays, bucketFor, summarizeAging } from './aging';

const asOf = new Date('2026-07-02T00:00:00Z');

describe('aging', () => {
  it('computes overdue days (positive when past due)', () => {
    expect(overdueDays(new Date('2026-06-22T00:00:00Z'), asOf)).toBe(10);
    expect(overdueDays(new Date('2026-07-12T00:00:00Z'), asOf)).toBe(-10);
  });

  it('buckets by overdue days', () => {
    expect(bucketFor(new Date('2026-07-20T00:00:00Z'), asOf)).toBe('current');
    expect(bucketFor(new Date('2026-06-20T00:00:00Z'), asOf)).toBe('1-30');
    expect(bucketFor(new Date('2026-05-20T00:00:00Z'), asOf)).toBe('31-60');
    expect(bucketFor(new Date('2026-04-20T00:00:00Z'), asOf)).toBe('61-90');
    expect(bucketFor(new Date('2026-02-20T00:00:00Z'), asOf)).toBe('90+');
  });

  it('summarizes counts and amounts per bucket', () => {
    const summary = summarizeAging(
      [
        { dueDate: new Date('2026-07-20T00:00:00Z'), amountDueCents: 1000 },
        { dueDate: new Date('2026-06-20T00:00:00Z'), amountDueCents: 2000 },
        { dueDate: new Date('2026-06-10T00:00:00Z'), amountDueCents: 500 },
      ],
      asOf,
    );
    expect(summary.current).toEqual({ count: 1, amountCents: 1000 });
    expect(summary['1-30']).toEqual({ count: 2, amountCents: 2500 });
    expect(summary['31-60']).toEqual({ count: 0, amountCents: 0 });
  });
});
