'use client';

import Link from 'next/link';
import { useState, type ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FlowTimeline } from '@/components/flow-timeline';
import {
  useCustomizeFlow,
  useFlow,
  useResetFlow,
  useSaveSteps,
  useTemplates,
  type FlowScope,
} from '@/lib/api/config';

function ScopeSwitch({
  scope,
  onChange,
}: {
  scope: FlowScope;
  onChange: (scope: FlowScope) => void;
}): ReactElement {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-inset p-1">
      {(['global', 'client'] as FlowScope[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200 ${
            scope === s ? 'bg-paid text-paper' : 'text-muted hover:text-ink'
          }`}
        >
          {s === 'global' ? 'Global' : 'This client'}
        </button>
      ))}
    </div>
  );
}

function WorkflowContent(): ReactElement {
  const [scope, setScope] = useState<FlowScope>('global');
  const { data: flow, isLoading: flowLoading } = useFlow(scope);
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const saveSteps = useSaveSteps(scope);
  const customizeFlow = useCustomizeFlow();
  const resetFlow = useResetFlow();

  const isLoading = flowLoading || templatesLoading;
  const inheriting = scope === 'client' && !!flow && !flow.isOverride;
  const readOnly = inheriting;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-[1.75rem] font-semibold">Workflow</h1>
          <p className="text-sm text-muted">
            Drag reminder steps to reorder them around the invoice due date.
          </p>
        </div>
        <ScopeSwitch scope={scope} onChange={setScope} />
      </div>

      {scope === 'client' && inheriting && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-paid-tint px-4 py-3">
          <p className="text-sm text-paid-deep">
            Inheriting the global flow. Customize it to set steps specific to this client.
          </p>
          <Button
            variant="secondary"
            onClick={() => customizeFlow.mutate()}
            disabled={customizeFlow.isPending}
          >
            {customizeFlow.isPending ? 'Customizing…' : 'Customize'}
          </Button>
        </div>
      )}

      {scope === 'client' && flow?.isOverride && (
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
          <FlowTimeline
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
        <div className="min-h-screen bg-paper text-ink">
          <header className="border-b border-line bg-paper">
            <div className="mx-auto flex max-w-(--maxw) items-center justify-between px-6 py-4">
              <div className="flex items-center gap-8">
                <span className="font-display text-lg font-semibold tracking-[-0.01em]">Revey</span>
                <nav className="flex items-center gap-5 text-sm font-medium text-muted">
                  <Link href="/" className="transition-colors duration-200 hover:text-ink">
                    Dashboard
                  </Link>
                  <Link href="/connections" className="transition-colors duration-200 hover:text-ink">
                    Connections
                  </Link>
                  <Link href="/approvals" className="transition-colors duration-200 hover:text-ink">
                    Approvals
                  </Link>
                  <Link href="/templates" className="transition-colors duration-200 hover:text-ink">
                    Templates
                  </Link>
                  <Link href="/workflow" className="text-ink">
                    Workflow
                  </Link>
                </nav>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-(--maxw) px-6 py-8">
            <WorkflowContent />
          </main>
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
