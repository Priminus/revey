'use client';

import type { ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/card';
import { FlowCanvas } from '@/components/flow-canvas';
import { useFlow, useSaveSteps, useTemplates } from '@/lib/api/config';

function GlobalWorkflowContent(): ReactElement {
  const { data: flow, isLoading: flowLoading } = useFlow('global');
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const saveSteps = useSaveSteps('global');

  const isLoading = flowLoading || templatesLoading;

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 text-[1.75rem] font-semibold">Global workflow</h1>
        <p className="text-sm text-muted">
          The default reminder flow every client inherits unless they customize their own.
        </p>
      </div>

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
          />
        </Card>
      )}
    </div>
  );
}

export default function GlobalWorkflowPage(): ReactElement {
  return (
    <>
      <SignedIn>
        <AppShell>
          <GlobalWorkflowContent />
        </AppShell>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
