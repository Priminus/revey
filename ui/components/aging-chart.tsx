import type { AgingBucket } from '@/lib/api/ar-format';
import { AGING_BUCKETS, formatCents } from '@/lib/api/ar-format';

const TRACK_HEIGHT = 140;
const MIN_BAR_HEIGHT = 3;

// Escalating severity: "current" (not yet due) reads as neutral blue; the four
// overdue buckets step through the reserved status ramp from good to critical.
// Status colors are fixed across light/dark per the dataviz palette.
const BUCKET_COLOR: Record<AgingBucket, string> = {
  current: '#2a78d6',
  '1-30': '#0ca30c',
  '31-60': '#fab219',
  '61-90': '#ec835a',
  '90+': '#d03b3b',
};

interface AgingChartProps {
  aging: Record<AgingBucket, { count: number; amountCents: number }>;
}

export function AgingChart({ aging }: AgingChartProps) {
  const maxAmount = Math.max(1, ...AGING_BUCKETS.map((bucket) => aging[bucket]?.amountCents ?? 0));

  return (
    <div
      role="group"
      aria-label="Accounts receivable aging"
      className="rounded-xl border border-black/10 dark:border-white/10 bg-[#fcfcfb] dark:bg-[#1a1a19] px-6 py-5"
    >
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#898781] mb-4">
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
                  className="block w-6 rounded-t-[4px] transition-[height]"
                  style={{ height: heightPx, backgroundColor: BUCKET_COLOR[bucket] }}
                />
              </div>
              <p className="text-xs font-medium tabular-nums text-[#0b0b0b] dark:text-white">
                {amountLabel}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-[#898781]">{bucket}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
