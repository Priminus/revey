'use client';

import type { ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { AppShell } from '@/components/app-shell';
import { ApprovalToggle } from '@/components/approval-toggle';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FlowCanvas } from '@/components/flow-canvas';
import { useCustomizeFlow, useFlow, useResetFlow, useSaveSteps, useTemplates } from '@/lib/api/config';

function WorkflowContent(): ReactElement {
  const { data: flow, isLoading: flowLoading } = useFlow('client');
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const saveSteps = useSaveSteps('client');
  const customizeFlow = useCustomizeFlow();
  const resetFlow = useResetFlow();

  const isLoading = flowLoading || templatesLoading;
  const inheriting = !!flow && !flow.isOverride;
  const readOnly = inheriting;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[1.75rem] font-semibold">Workflow</h1>
          <p className="text-sm text-muted">
            Reminder steps flow from the invoice due date to a human approval before every send.
          </p>
        </div>
        <ApprovalToggle />
      </div>

      {inheriting && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-paid-tint px-4 py-3">
          <p className="text-sm text-paid-deep">
            Inheriting the global flow. Customize it to set steps specific to this client.
          </p>
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="secondary"
              onClick={() => customizeFlow.mutate()}
              disabled={customizeFlow.isPending}
            >
              {customizeFlow.isPending ? 'Customizing…' : 'Customize'}
            </Button>
            {customizeFlow.error && (
              <p className="text-xs text-danger">Could not customize. Try again.</p>
            )}
          </div>
        </div>
      )}

      {flow?.isOverride && (
        <div className="mb-6 flex justify-end">
          <Button
            variant="ghost"
            onClick={() => resetFlow.mutate()}
            disabled={resetFlow.isPending}
          >
            {resetFlow.isPending ? 'Resetting…' : 'Reset to global'}
          </Button>
        </div>
      )}

      {isLoading ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted">Loading flow…</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <FlowCanvas
            steps={flow?.steps ?? []}
            templates={templates ?? []}
            onSave={saveSteps.mutate}
            saving={saveSteps.isPending}
            readOnly={readOnly}
          />
        </Card>
      )}
    </div>
  );
}

export default function WorkflowPage(): ReactElement {
  return (
    <>
      <SignedIn>
        <AppShell>
          <WorkflowContent />
        </AppShell>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
