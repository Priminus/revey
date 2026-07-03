'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { AgingChart } from '@/components/aging-chart';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { KpiTile } from '@/components/kpi-tile';
import {
  useArSummary,
  useDebtors,
  useSyncAr,
  useScoreAll,
  formatCents,
  scoreBandTone,
} from '@/lib/api/ar';

function overdueBadgeTone(days: number): BadgeTone {
  if (days <= 0) return 'neutral';
  if (days > 60) return 'danger';
  if (days > 0) return 'overdue';
  return 'neutral';
}

function SyncButton(): ReactElement {
  const { mutate, isPending, data, error } = useSyncAr();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={() => mutate()} disabled={isPending}>
        {isPending ? 'Syncing…' : 'Sync from Xero'}
      </Button>
      {data && (
        <p className="tnum text-xs text-paid">
          Synced {data.debtors.toLocaleString('en-US')} debtors · {data.invoices.toLocaleString('en-US')} invoices
        </p>
      )}
      {error && <p className="text-xs text-danger">{(error as Error).message}</p>}
    </div>
  );
}

function ScoreAllButton(): ReactElement {
  const { mutate, isPending, data, error } = useScoreAll();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="secondary" onClick={() => mutate()} disabled={isPending}>
        {isPending ? 'Scoring…' : 'Score all'}
      </Button>
      {data && (
        <p className="tnum text-xs text-paid">Scored {data.scored.toLocaleString('en-US')} debtors</p>
      )}
      {error && <p className="text-xs text-danger">{(error as Error).message}</p>}
    </div>
  );
}

function DebtorsTable(): ReactElement {
  const { data: debtors, isLoading } = useDebtors();

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted">Loading debtors…</p>;
  }

  if (!debtors || debtors.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No AR yet — connect Xero and Sync.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-muted">
            <th className="py-2 pr-4 font-semibold">Debtor</th>
            <th className="py-2 pr-4 font-semibold">Email</th>
            <th className="py-2 pr-4 font-semibold text-right">Outstanding</th>
            <th className="py-2 pr-4 font-semibold text-right">Worst overdue</th>
            <th className="py-2 pr-4 font-semibold text-right">Open invoices</th>
            <th className="py-2 pr-4 font-semibold text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {debtors.map((debtor) => (
            <tr
              key={debtor.id}
              className="min-h-12 border-b border-line last:border-0 transition-colors duration-200 ease-[cubic-bezier(.22,.61,.36,1)] hover:bg-paid-tint"
            >
              <td className="py-3 pr-4 font-medium">
                <Link href={`/debtors/${debtor.id}`} className="text-ink transition-colors duration-200 hover:text-paid">
                  {debtor.name}
                </Link>
              </td>
              <td className="py-3 pr-4 text-muted">{debtor.email ?? '—'}</td>
              <td className="tnum py-3 pr-4 text-right">{formatCents(debtor.outstandingCents)}</td>
              <td className="py-3 pr-4 text-right">
                {debtor.worstOverdueDays > 0 ? (
                  <Badge tone={overdueBadgeTone(debtor.worstOverdueDays)}>
                    {debtor.worstOverdueDays}d
                  </Badge>
                ) : (
                  <span className="tnum text-muted">—</span>
                )}
              </td>
              <td className="tnum py-3 pr-4 text-right">{debtor.openInvoiceCount}</td>
              <td className="py-3 pr-4 text-right">
                {debtor.scoreValue !== null ? (
                  <Badge tone={scoreBandTone(debtor.scoreBand)}>{debtor.scoreValue}</Badge>
                ) : (
                  <span className="tnum text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard(): ReactElement {
  const { data: summary } = useArSummary();

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-(--maxw) items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="font-display text-lg font-semibold tracking-[-0.01em]">Revey</span>
            <nav className="flex items-center gap-5 text-sm font-medium text-muted">
              <Link href="/" className="text-ink">
                Dashboard
              </Link>
              <Link href="/connections" className="transition-colors duration-200 hover:text-ink">
                Connections
              </Link>
              <Link href="/approvals" className="transition-colors duration-200 hover:text-ink">
                Approvals
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-(--maxw) px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.75rem] font-semibold">Dashboard</h1>
            <p className="mt-1 text-sm text-muted">
              Accounts receivable, aging, and outreach at a glance.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <ScoreAllButton />
            <SyncButton />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiTile
            label="Total outstanding"
            value={summary ? formatCents(summary.totalOutstandingCents) : '—'}
          />
          <KpiTile
            label="Overdue"
            value={summary ? formatCents(summary.overdueCents) : '—'}
            tone="warning"
          />
          <KpiTile label="Debtors" value={summary ? String(summary.debtorCount) : '—'} />
          <KpiTile
            label="Open invoices"
            value={summary ? String(summary.openInvoiceCount) : '—'}
          />
        </div>

        {summary && (
          <Card className="mb-6">
            <AgingChart aging={summary.aging} />
          </Card>
        )}

        <Card>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Debtors
          </h2>
          <DebtorsTable />
        </Card>
      </main>
    </div>
  );
}

export default function Home(): ReactElement {
  return (
    <>
      <SignedIn>
        <Dashboard />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
