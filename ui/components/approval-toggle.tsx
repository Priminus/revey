'use client';

import type { ReactElement } from 'react';
import { Card } from '@/components/card';
import { useSettings, useUpdateSettings } from '@/lib/api/config';

// Per-client autonomy switch: ON = drafts require human approval (queued in
// Approvals); OFF = the agent auto-sends outreach when it generates it.
export function ApprovalToggle(): ReactElement {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const requireApproval = settings ? !settings.autoSend : true;
  const disabled = isLoading || updateSettings.isPending;

  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        role="switch"
        aria-checked={requireApproval}
        aria-label="Require approval before sending"
        disabled={disabled}
        onClick={() => settings && updateSettings.mutate({ autoSend: !settings.autoSend })}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ease-[cubic-bezier(.22,.61,.36,1)] disabled:cursor-not-allowed disabled:opacity-60 ${
          requireApproval ? 'border-line bg-inset' : 'border-paid bg-paid-tint'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full transition-transform duration-200 ease-[cubic-bezier(.22,.61,.36,1)] ${
            requireApproval ? 'translate-x-1 bg-muted' : 'translate-x-6 bg-paid'
          }`}
        />
      </button>
      <div>
        <p className="text-sm font-semibold text-ink">Require approval before sending</p>
        <p className="text-xs text-muted">
          {requireApproval
            ? 'Drafts wait in Approvals for a human to send.'
            : 'Outreach sends automatically when generated.'}
        </p>
      </div>
    </Card>
  );
}
