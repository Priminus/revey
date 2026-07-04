'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { SignedIn, SignedOut, RedirectToSignIn, useAuth } from '@clerk/nextjs';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { useVendors } from '@/lib/api/ar';
import { useFlow, useCustomizeFlow, useSaveSteps, useRunOutreach } from '@/lib/api/config';
import { offsetLabel, type FlowStep, type SaveStepsInput } from '@/lib/api/config-format';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

type StepId = 1 | 2 | 3 | 4 | 5;
type Mode = 'Review' | 'Automatic';

interface StepMeta {
  id: StepId;
  title: string;
}

const STEPS: StepMeta[] = [
  { id: 1, title: 'Connect your accounting' },
  { id: 2, title: 'Your reminder cadence' },
  { id: 3, title: 'Review or Automatic' },
  { id: 4, title: 'Send a test' },
  { id: 5, title: "You're all set" },
];

interface XeroStatus {
  connected: boolean;
  xeroTenantId?: string;
}

function useXeroStatus(): {
  status: XeroStatus | null;
  error: string | null;
  connect: () => Promise<void>;
} {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<XeroStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/integrations/xero/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            setError(
              res.status === 403
                ? 'Your account is not linked to a Revey client yet.'
                : `Could not load Xero status (HTTP ${res.status}).`,
            );
          }
          return;
        }
        const data = (await res.json()) as XeroStatus;
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Could not reach the Revey API.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const connect = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/integrations/xero/connect`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(
          res.status === 403
            ? 'Your account is not linked to a Revey client yet.'
            : `Could not start the Xero connection (HTTP ${res.status}).`,
        );
        return;
      }
      const { authorizeUrl } = (await res.json()) as { authorizeUrl?: string };
      if (!authorizeUrl) {
        setError('The server did not return a Xero authorization URL.');
        return;
      }
      window.location.href = authorizeUrl;
    } catch {
      setError('Could not reach the Revey API.');
    }
  }, [getToken]);

  return { status, error, connect };
}

function StepList({
  current,
  completed,
  onSelect,
}: {
  current: StepId;
  completed: Record<StepId, boolean>;
  onSelect: (id: StepId) => void;
}): ReactElement {
  return (
    <ol className="flex flex-col gap-1">
      {STEPS.map((step) => {
        const active = step.id === current;
        const done = completed[step.id];
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              aria-current={active ? 'step' : undefined}
              className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-200 ease-[cubic-bezier(.22,.61,.36,1)] ${
                active ? 'bg-paid-tint' : 'hover:bg-inset'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
                  done
                    ? 'bg-paid text-paper'
                    : active
                      ? 'bg-ink text-paper'
                      : 'bg-inset text-muted'
                }`}
              >
                {done ? '✓' : step.id}
              </span>
              <span
                className={`text-sm font-medium ${active ? 'text-paid-deep' : 'text-ink'}`}
              >
                {step.title}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepHeader({ eyebrow, title }: { eyebrow: string; title: string }): ReactElement {
  return (
    <div className="mb-5">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {eyebrow}
      </p>
      <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.01em]">{title}</h2>
    </div>
  );
}

function ConnectStep({
  status,
  error,
  onConnect,
}: {
  status: XeroStatus | null;
  error: string | null;
  onConnect: () => Promise<void>;
}): ReactElement {
  const connected = !!status?.connected;
  return (
    <div>
      <StepHeader eyebrow="Step 1" title="Connect your accounting" />
      <p className="mb-5 max-w-lg text-sm text-muted">
        Revey reads your accounts receivable from Xero to know who owes what.
      </p>

      <div className="flex flex-col gap-3">
        <Card className="flex items-center justify-between">
          <div>
            <p className="font-display font-semibold">Xero</p>
            <p className="text-sm text-muted">Accounting &amp; AR data source</p>
            {connected && (
              <div className="mt-2">
                <Badge tone="paid">Connected ✓{status?.xeroTenantId ? ` · ${status.xeroTenantId}` : ''}</Badge>
              </div>
            )}
            {error && <p className="mt-1 text-sm text-danger">{error}</p>}
          </div>
          {!connected && <Button onClick={() => void onConnect()}>Connect</Button>}
        </Card>

        <Card className="flex items-center justify-between opacity-60">
          <div>
            <p className="font-display font-semibold text-muted">WhatsApp Business</p>
            <p className="text-sm text-muted">Chase debtors over WhatsApp</p>
          </div>
          <Badge tone="neutral">Coming soon</Badge>
        </Card>
      </div>
    </div>
  );
}

function CadenceStep({
  steps,
  loading,
}: {
  steps: FlowStep[];
  loading: boolean;
}): ReactElement {
  const reminders = steps.filter((s) => s.type === 'reminder');
  return (
    <div>
      <StepHeader eyebrow="Step 2" title="Your reminder cadence" />
      <p className="mb-5 max-w-lg text-sm text-muted">
        Revey follows this cadence by default, sending branded reminders as invoices approach and
        pass their due date. You can fully customize it in{' '}
        <Link href="/workflow" className="font-medium text-info hover:underline">
          Workflow
        </Link>
        .
      </p>

      {loading ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted">Loading cadence…</p>
        </Card>
      ) : reminders.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted">No reminders configured yet.</p>
        </Card>
      ) : (
        <ol className="flex flex-col gap-2">
          {reminders.map((step, i) => (
            <li
              key={step.id ?? i}
              className="flex items-center gap-4 rounded-[14px] border border-line bg-paper px-4 py-3"
            >
              <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-inset text-[13px] font-semibold text-muted">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {step.templateName ?? 'Reminder'}
                </p>
                <p className="tnum text-[13px] text-muted">{offsetLabel(step.offsetDays)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ModeCard({
  title,
  description,
  selected,
  recommended,
  disabled,
  onSelect,
}: {
  title: string;
  description: string;
  selected: boolean;
  recommended?: boolean;
  disabled: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex flex-col gap-2 rounded-[14px] border px-5 py-4 text-left transition-colors duration-200 ease-[cubic-bezier(.22,.61,.36,1)] disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? 'border-paid bg-paid-tint'
          : 'border-line bg-paper hover:bg-inset'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-semibold text-ink">{title}</span>
        {recommended && <Badge tone="paid">Recommended</Badge>}
        {selected && !recommended && (
          <span aria-hidden className="text-paid">
            ✓
          </span>
        )}
      </div>
      <span className="text-sm text-muted">{description}</span>
    </button>
  );
}

function ModeStep({
  mode,
  onChoose,
  saving,
  error,
}: {
  mode: Mode;
  onChoose: (m: Mode) => void;
  saving: boolean;
  error: string | null;
}): ReactElement {
  return (
    <div>
      <StepHeader eyebrow="Step 3" title="Review or Automatic" />
      <p className="mb-5 max-w-lg text-sm text-muted">
        Revey drafts every reminder email for you. Choose how they go out:
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          title="Review"
          recommended
          description="Revey drafts each email and waits for you to approve it in Approvals before it's sent to the contact."
          selected={mode === 'Review'}
          disabled={saving}
          onSelect={() => onChoose('Review')}
        />
        <ModeCard
          title="Automatic"
          description="Revey sends reminders on its own, on schedule. You can still review everything in Approvals."
          selected={mode === 'Automatic'}
          disabled={saving}
          onSelect={() => onChoose('Automatic')}
        />
      </div>

      {saving && <p className="mt-3 text-sm text-muted">Saving your choice…</p>}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}

interface TestResult {
  kind: 'sent' | 'drafted' | 'error';
  message: string;
}

function TestStep({
  onSent,
}: {
  onSent: () => void;
}): ReactElement {
  const { data: vendors, isLoading } = useVendors();
  const runOutreach = useRunOutreach();
  const [vendorId, setVendorId] = useState<string>('');
  const [result, setResult] = useState<TestResult | null>(null);

  const options = vendors ?? [];
  const effectiveVendorId = vendorId || options[0]?.id || '';

  const handleSend = async (): Promise<void> => {
    if (!effectiveVendorId) return;
    setResult(null);
    try {
      const res = await runOutreach.mutateAsync(effectiveVendorId);
      if (res.autoSent && res.result?.status === 'sent') {
        setResult({ kind: 'sent', message: 'Sent ✓ — check your inbox' });
        onSent();
      } else if (res.result?.status === 'failed') {
        setResult({ kind: 'error', message: res.result.error ?? 'The test reminder failed to send.' });
      } else {
        setResult({ kind: 'drafted', message: 'Drafted — review it in Approvals' });
        onSent();
      }
    } catch (err) {
      setResult({ kind: 'error', message: (err as Error).message });
    }
  };

  return (
    <div>
      <StepHeader eyebrow="Step 4" title="Send a test" />
      <p className="mb-5 max-w-lg text-sm text-muted">
        See it in action. Pick a vendor and Revey will draft + send a test reminder (in test mode it
        goes to your own inbox). If that vendor&apos;s due reminder needs approval it queues in
        Approvals, otherwise it sends straight away.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={effectiveVendorId}
          onChange={(e) => setVendorId(e.target.value)}
          disabled={isLoading || options.length === 0}
          aria-label="Vendor"
          className="min-w-56 rounded-[14px] border border-line bg-paper px-3 py-2 text-sm text-ink transition-colors duration-200 hover:bg-inset disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.length === 0 && <option value="">No vendors available</option>}
          {options.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <Button
          onClick={() => void handleSend()}
          disabled={runOutreach.isPending || !effectiveVendorId}
        >
          {runOutreach.isPending ? 'Sending…' : 'Send test reminder'}
        </Button>
      </div>

      {result && (
        <div className="mt-4">
          {result.kind === 'sent' && (
            <p className="text-sm font-medium text-paid-deep">{result.message}</p>
          )}
          {result.kind === 'drafted' && (
            <p className="text-sm font-medium text-ink">
              {result.message} —{' '}
              <Link href="/approvals" className="text-info hover:underline">
                open Approvals
              </Link>
            </p>
          )}
          {result.kind === 'error' && (
            <p className="text-sm font-medium text-danger">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, done }: { label: string; done: boolean }): ReactElement {
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <span
        aria-hidden
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold ${
          done ? 'bg-paid text-paper' : 'bg-inset text-muted'
        }`}
      >
        {done ? '✓' : '·'}
      </span>
      <span className="text-sm text-ink">{label}</span>
    </li>
  );
}

function DoneStep({
  xeroConnected,
  modeChosen,
  mode,
  testSent,
}: {
  xeroConnected: boolean;
  modeChosen: boolean;
  mode: Mode;
  testSent: boolean;
}): ReactElement {
  return (
    <div>
      <StepHeader eyebrow="Step 5" title="You're all set" />
      <p className="mb-5 max-w-lg text-sm text-muted">
        Revey is ready to start chasing invoices for you. Here&apos;s where things stand:
      </p>

      <Card className="mb-6">
        <ul>
          <SummaryRow label="Xero connected" done={xeroConnected} />
          <SummaryRow label="Reminder cadence ready" done />
          <SummaryRow label={`Sending mode: ${mode}`} done={modeChosen} />
          <SummaryRow label="Test reminder sent" done={testSent} />
        </ul>
      </Card>

      <Link href="/">
        <Button>Go to Dashboard</Button>
      </Link>
    </div>
  );
}

function OnboardingContent(): ReactElement {
  const { status: xeroStatus, error: xeroError, connect } = useXeroStatus();
  const { data: flow, isLoading: flowLoading } = useFlow('client');
  const customizeFlow = useCustomizeFlow();
  const saveSteps = useSaveSteps('client');

  const [current, setCurrent] = useState<StepId>(1);
  const [modeChosen, setModeChosen] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);

  const xeroConnected = !!xeroStatus?.connected;

  const derivedMode: Mode = useMemo(() => {
    const reminders = (flow?.steps ?? []).filter((s) => s.type === 'reminder');
    return reminders.some((s) => s.requireApproval) ? 'Review' : 'Automatic';
  }, [flow]);

  const completed: Record<StepId, boolean> = {
    1: xeroConnected,
    2: false,
    3: modeChosen,
    4: testSent,
    5: false,
  };

  const saving = customizeFlow.isPending || saveSteps.isPending;

  const handleChooseMode = useCallback(
    async (mode: Mode): Promise<void> => {
      if (!flow) return;
      setModeError(null);
      try {
        if (flow.isOverride === false) {
          await customizeFlow.mutateAsync();
        }
        const payload: SaveStepsInput[] = flow.steps.map((s) => ({
          offsetDays: s.offsetDays,
          templateId: s.templateId,
          order: s.order,
          type: s.type,
          config: s.config,
          requireApproval: s.type === 'reminder' ? mode === 'Review' : s.requireApproval,
        }));
        await saveSteps.mutateAsync(payload);
        setModeChosen(true);
      } catch (err) {
        setModeError((err as Error).message || 'Could not save your choice. Try again.');
      }
    },
    [flow, customizeFlow, saveSteps],
  );

  // Mark onboarding complete once the user reaches the final step.
  useEffect(() => {
    if (current === 5 && typeof window !== 'undefined') {
      window.localStorage.setItem('revey.onboarded', 'true');
    }
  }, [current]);

  let body: ReactNode;
  switch (current) {
    case 1:
      body = <ConnectStep status={xeroStatus} error={xeroError} onConnect={connect} />;
      break;
    case 2:
      body = <CadenceStep steps={flow?.steps ?? []} loading={flowLoading} />;
      break;
    case 3:
      body = (
        <ModeStep
          mode={derivedMode}
          onChoose={(m) => void handleChooseMode(m)}
          saving={saving}
          error={modeError}
        />
      );
      break;
    case 4:
      body = <TestStep onSent={() => setTestSent(true)} />;
      break;
    case 5:
    default:
      body = (
        <DoneStep
          xeroConnected={xeroConnected}
          modeChosen={modeChosen}
          mode={derivedMode}
          testSent={testSent}
        />
      );
      break;
  }

  const canBack = current > 1;
  const canContinue = current < 5;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.01em]">
          Set up Revey
        </h1>
        <p className="mt-1 text-sm text-muted">
          A few steps to get Revey chasing your overdue invoices.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <div className="md:sticky md:top-8 md:self-start">
          <StepList current={current} completed={completed} onSelect={setCurrent} />
        </div>

        <div className="flex min-h-[360px] flex-col">
          <div className="flex-1">{body}</div>

          <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
            <Button
              variant="secondary"
              onClick={() => setCurrent((s) => (s > 1 ? ((s - 1) as StepId) : s))}
              disabled={!canBack}
            >
              Back
            </Button>
            {canContinue && (
              <Button
                onClick={() => setCurrent((s) => (s < 5 ? ((s + 1) as StepId) : s))}
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage(): ReactElement {
  return (
    <>
      <SignedIn>
        <AppShell>
          <OnboardingContent />
        </AppShell>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
