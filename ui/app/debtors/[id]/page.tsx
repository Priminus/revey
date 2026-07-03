'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { useDebtor, useDraftDebtor, formatCents, scoreBandTone } from '@/lib/api/ar';

function bucketBadgeTone(bucket: string): BadgeTone {
  switch (bucket) {
    case 'current':
      return 'paid';
    case '1-30':
    case '31-60':
      return 'overdue';
    case '61-90':
    case '90+':
      return 'danger';
    default:
      return 'neutral';
  }
}

function recommendedActionLabel(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function ScorePanel({
  debtorId,
  scoreValue,
  scoreBand,
  recommendedAction,
  scoreRationale,
}: {
  debtorId: string;
  scoreValue: number | null;
  scoreBand: string | null;
  recommendedAction: string | null;
  scoreRationale: string | null;
}): ReactElement {
  const { mutate, isPending, data, error } = useDraftDebtor(debtorId);

  return (
    <Card className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Agent score
        </h2>
        <Button variant="secondary" onClick={() => mutate()} disabled={isPending}>
          {isPending ? 'Drafting…' : 'Draft outreach'}
        </Button>
      </div>

      {scoreValue === null ? (
        <p className="text-sm text-muted">Not scored yet — run &ldquo;Score all&rdquo; from the dashboard.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Score</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="tnum font-display text-2xl font-semibold">{scoreValue}</span>
              <Badge tone={scoreBandTone(scoreBand)}>{scoreBand}</Badge>
            </div>
          </div>
          {recommendedAction && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Recommended action
              </p>
              <p className="mt-1.5 text-sm font-medium text-ink">
                {recommendedActionLabel(recommendedAction)}
              </p>
            </div>
          )}
          {scoreRationale && (
            <div className="min-w-[200px] flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Rationale
              </p>
              <p className="mt-1.5 text-sm text-muted">{scoreRationale}</p>
            </div>
          )}
        </div>
      )}

      {data && (
        <p className="mt-4 text-sm text-paid">
          Draft created —{' '}
          <Link href="/approvals" className="font-medium underline hover:text-paid-deep">
            review it in Approvals
          </Link>
          .
        </p>
      )}
      {error && <p className="mt-4 text-sm text-danger">{(error as Error).message}</p>}
    </Card>
  );
}

function InteractionHistory({
  interactions,
}: {
  interactions: { id: string; type: string; summary: string; createdAt: string }[];
}): ReactElement {
  return (
    <Card className="mt-6">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Interaction history
      </h2>
      {interactions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No interactions yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {interactions.map((interaction) => (
            <li key={interaction.id} className="flex items-start justify-between gap-4 py-3">
              <div>
                <Badge tone="neutral">{interaction.type}</Badge>
                <p className="mt-1.5 text-sm text-ink">{interaction.summary}</p>
              </div>
              <span className="tnum shrink-0 text-xs text-muted">{interaction.createdAt}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DebtorDetail(): ReactElement {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { data: debtor, isLoading } = useDebtor(id);

  return (
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
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors duration-200 hover:text-paid"
        >
          ← Back to dashboard
        </Link>

        {isLoading && <p className="text-sm text-muted">Loading debtor…</p>}

        {!isLoading && !debtor && <p className="text-sm text-muted">Debtor not found.</p>}

        {debtor && (
          <>
            <h1 className="text-[1.75rem] font-semibold">{debtor.name}</h1>
            <p className="mt-1 text-sm text-muted">{debtor.email ?? 'No email on file'}</p>

            <Card className="mt-6">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Invoices
              </h2>
              {debtor.invoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No invoices on file.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-[13px] text-muted">
                        <th className="py-2 pr-4 font-semibold">Number</th>
                        <th className="py-2 pr-4 font-semibold">Issued</th>
                        <th className="py-2 pr-4 font-semibold">Due</th>
                        <th className="py-2 pr-4 font-semibold text-right">Total</th>
                        <th className="py-2 pr-4 font-semibold text-right">Amount due</th>
                        <th className="py-2 pr-4 font-semibold">Status</th>
                        <th className="py-2 pr-4 font-semibold text-right">Overdue</th>
                        <th className="py-2 pr-4 font-semibold">Bucket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debtor.invoices.map((invoice) => (
                        <tr
                          key={invoice.id}
                          className="border-b border-line last:border-0 transition-colors duration-200 ease-[cubic-bezier(.22,.61,.36,1)] hover:bg-paid-tint"
                        >
                          <td className="py-3 pr-4 font-medium">{invoice.invoiceNumber}</td>
                          <td className="py-3 pr-4 text-muted">{invoice.issueDate}</td>
                          <td className="py-3 pr-4 text-muted">{invoice.dueDate}</td>
                          <td className="tnum py-3 pr-4 text-right">{formatCents(invoice.totalCents)}</td>
                          <td className="tnum py-3 pr-4 text-right">
                            {formatCents(invoice.amountDueCents)}
                          </td>
                          <td className="py-3 pr-4 text-muted">{invoice.status}</td>
                          <td className="tnum py-3 pr-4 text-right">
                            {invoice.overdueDays > 0 ? `${invoice.overdueDays}d` : '—'}
                          </td>
                          <td className="py-3 pr-4">
                            <Badge tone={bucketBadgeTone(invoice.bucket)}>{invoice.bucket}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <ScorePanel
              debtorId={debtor.id}
              scoreValue={debtor.scoreValue}
              scoreBand={debtor.scoreBand}
              recommendedAction={debtor.recommendedAction}
              scoreRationale={debtor.scoreRationale}
            />

            <InteractionHistory interactions={debtor.interactions} />
          </>
        )}
      </div>
    </div>
  );
}

export default function DebtorDetailPage(): ReactElement {
  return (
    <>
      <SignedIn>
        <DebtorDetail />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
