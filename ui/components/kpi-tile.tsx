export type KpiTone = 'neutral' | 'warning' | 'critical';

const TONE_VALUE_CLASS: Record<KpiTone, string> = {
  neutral: 'text-[#0b0b0b] dark:text-white',
  warning: 'text-[#c98500] dark:text-[#fab219]',
  critical: 'text-[#d03b3b] dark:text-[#e66767]',
};

interface KpiTileProps {
  label: string;
  value: string;
  tone?: KpiTone;
}

export function KpiTile({ label, value, tone = 'neutral' }: KpiTileProps) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-[#fcfcfb] dark:bg-[#1a1a19] px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#898781]">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${TONE_VALUE_CLASS[tone]}`}>
        {value}
      </p>
    </div>
  );
}
