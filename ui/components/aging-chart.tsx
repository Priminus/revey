import type { AgingBucket } from '@/lib/api/ar-format';
import { AGING_BUCKETS, formatCents } from '@/lib/api/ar-format';

const TRACK_HEIGHT = 140;
const MIN_BAR_HEIGHT = 3;

// Revey severity ramp: "current" (not yet due) reads as healthy paid-green;
// the four overdue buckets step through the reserved amber/red ramp from
// just-slipped to write-off risk. See DESIGN.md §6.
const BUCKET_COLOR: Record<AgingBucket, string> = {
  current: '#0E8A55',
  '1-30': '#33B06B',
  '31-60': '#C0762F',
  '61-90': '#8A5012',
  '90+': '#C0492F',
};

interface AgingChartProps {
  aging: Record<AgingBucket, { count: number; amountCents: number }>;
}

export function AgingChart({ aging }: AgingChartProps) {
  const maxAmount = Math.max(1, ...AGING_BUCKETS.map((bucket) => aging[bucket]?.amountCents ?? 0));

  return (
    <div role="group" aria-label="Accounts receivable aging">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Aging by bucket
      </h2>
      <div
        className="flex items-end gap-4 sm:gap-6"
        style={{ height: TRACK_HEIGHT + 56 }}
      >
        {AGING_BUCKETS.map((bucket) => {
          const entry = aging[bucket] ?? { count: 0, amountCents: 0 };
          const heightPx =
            entry.amountCents > 0
              ? Math.max(MIN_BAR_HEIGHT, Math.round((entry.amountCents / maxAmount) * TRACK_HEIGHT))
              : MIN_BAR_HEIGHT;
          const amountLabel = formatCents(entry.amountCents);

          return (
            <div key={bucket} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="flex flex-col justify-end"
                style={{ height: TRACK_HEIGHT }}
              >
                <span
                  role="img"
                  aria-label={`${bucket} days: ${entry.count} invoice${entry.count === 1 ? '' : 's'}, ${amountLabel} outstanding`}
                  className="block w-6 rounded-t-[4px] transition-[height] duration-200 ease-[cubic-bezier(.22,.61,.36,1)]"
                  style={{ height: heightPx, backgroundColor: BUCKET_COLOR[bucket] }}
                />
              </div>
              <p className="tnum text-xs font-medium text-ink">{amountLabel}</p>
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted">{bucket}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
