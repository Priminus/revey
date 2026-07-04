'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { AppShell } from '@/components/app-shell';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import {
  useVendors,
  useScoreAllVendors,
  formatCents,
  scoreBandTone,
} from '@/lib/api/ar';

function overdueBadgeTone(days: number): BadgeTone {
  if (days > 60) return 'danger';
  if (days > 0) return 'overdue';
  return 'neutral';
}

function RefreshScoresButton(): ReactElement {
  const { mutate, isPending, data, error } = useScoreAllVendors();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={() => mutate()} disabled={isPending}>
        {isPending ? 'Scoring…' : 'Refresh scores'}
      </Button>
      {data && (
        <p className={`tnum text-xs ${data.failed > 0 ? 'text-danger' : 'text-paid'}`}>
          Scored {data.scored.toLocaleString('en-US')}
          {data.failed > 0 ? ` (${data.failed.toLocaleString('en-US')} failed)` : ''}
        </p>
      )}
      {error && <p className="text-xs text-danger">{(error as Error).message}</p>}
    </div>
  );
}

function VendorsTable(): ReactElement {
  const { data: vendors, isLoading } = useVendors();

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted">Loading vendors…</p>;
  }

  if (!vendors || vendors.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No vendors yet — connect Xero and Sync.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-muted">
            <th className="py-2 pr-4 font-semibold">Name</th>
            <th className="py-2 pr-4 font-semibold">Score</th>
            <th className="py-2 pr-4 font-semibold">Recommended action</th>
            <th className="py-2 pr-4 font-semibold text-right">Outstanding</th>
            <th className="py-2 pr-4 font-semibold text-right">Worst overdue</th>
            <th className="py-2 pr-4 font-semibold text-right">Open invoices</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => (
            <tr
              key={vendor.id}
              className="min-h-12 border-b border-line last:border-0 transition-colors duration-200 ease-[cubic-bezier(.22,.61,.36,1)] hover:bg-paid-tint"
            >
              <td className="py-3 pr-4 font-medium">
                <Link
                  href={`/debtors/${vendor.id}`}
                  className="text-ink transition-colors duration-200 hover:text-paid"
                >
                  {vendor.name}
                </Link>
              </td>
              <td className="py-3 pr-4">
                {vendor.scoreValue !== null ? (
                  <Badge tone={scoreBandTone(vendor.scoreBand)}>{vendor.scoreValue}</Badge>
                ) : (
                  <span className="tnum text-muted">—</span>
                )}
              </td>
              <td className="py-3 pr-4 text-muted">
                {vendor.recommendedAction ? vendor.recommendedAction.replace(/_/g, ' ') : '—'}
              </td>
              <td className="tnum py-3 pr-4 text-right">{formatCents(vendor.outstandingCents)}</td>
              <td className="py-3 pr-4 text-right">
                {vendor.worstOverdueDays > 0 ? (
                  <Badge tone={overdueBadgeTone(vendor.worstOverdueDays)}>
                    {vendor.worstOverdueDays}d
                  </Badge>
                ) : (
                  <span className="tnum text-muted">—</span>
                )}
              </td>
              <td className="tnum py-3 pr-4 text-right">{vendor.openInvoiceCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Vendors(): ReactElement {
  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold">Vendors</h1>
          <p className="mt-1 text-sm text-muted">
            Every company Revey knows for this client, scored on willingness to pay —
            riskiest first.
          </p>
        </div>
        <RefreshScoresButton />
      </div>

      <Card>
        <VendorsTable />
      </Card>
    </AppShell>
  );
}

export default function VendorsPage(): ReactElement {
  return (
    <>
      <SignedIn>
        <Vendors />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
