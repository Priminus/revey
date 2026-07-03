export type KpiTone = 'neutral' | 'positive' | 'warning' | 'critical';

const TONE_VALUE_CLASS: Record<KpiTone, string> = {
  neutral: 'text-ink',
  positive: 'text-paid',
  warning: 'text-overdue',
  critical: 'text-danger',
};

interface KpiTileProps {
  label: string;
  value: string;
  tone?: KpiTone;
}

export function KpiTile({ label, value, tone = 'neutral' }: KpiTileProps) {
  return (
    <div className="rounded-[14px] border border-line bg-paper px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`tnum mt-2 text-3xl font-semibold ${TONE_VALUE_CLASS[tone]}`}>{value}</p>
    </div>
  );
}
