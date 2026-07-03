// Pure formatting/constants/types for config (templates + flow) data — no
// Clerk import here so components and tests that only need display helpers
// or types can avoid mocking @clerk/nextjs.

export type FlowScope = 'global' | 'client';

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  scope: FlowScope;
}

export interface FlowStep {
  id?: string;
  offsetDays: number;
  order: number;
  templateId: string;
  templateName?: string;
}

export interface EffectiveFlow {
  flowId: string | null;
  isOverride: boolean;
  steps: FlowStep[];
}

/**
 * Mirrors the backend `renderTemplate` (api/src/config/template.service.ts):
 * replaces `{{ key }}` (case-insensitive, arbitrary whitespace inside
 * braces) with `vars[key]` when it is an own property, else blanks it.
 */
export function renderPreview(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '',
  );
}

export const SAMPLE_VARS: Record<string, string> = {
  debtor_name: 'Harbour Logistics Pte Ltd',
  outstanding_amount: '$86,150',
  invoice_count: '3',
  oldest_days_overdue: '120',
  invoice_list:
    'INV-0031 — $45,000, 120 days overdue\nINV-0032 — $22,400, 75 days overdue',
};
