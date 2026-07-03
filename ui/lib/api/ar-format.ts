// Pure formatting/constants/types for AR + agent data — no Clerk import here
// so components and tests that only need display helpers or types (e.g.
// AgingChart, approvals page tests) can avoid mocking @clerk/nextjs.

import type { BadgeTone } from '@/components/badge';

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';
export const AGING_BUCKETS: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];

export function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export type ScoreBand = 'likely' | 'uncertain' | 'at_risk';

/** Maps an agent score band to the Badge tone used to render it. */
export function scoreBandTone(band: string | null): BadgeTone {
  switch (band) {
    case 'likely':
      return 'paid';
    case 'uncertain':
      return 'overdue';
    case 'at_risk':
      return 'danger';
    default:
      return 'neutral';
  }
}

export interface DraftRow {
  id: string;
  debtorId: string;
  debtorName: string;
  subject: string;
  body: string;
  status: string;
  toEmailIntended: string | null;
  toEmailActual: string | null;
  scoreValueAtDraft: number | null;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
}
