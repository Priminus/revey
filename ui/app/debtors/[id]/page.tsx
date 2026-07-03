'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { Badge, type BadgeTone } from '@/components/badge';
import { Card } from '@/components/card';
import { useDebtor, formatCents } from '@/lib/api/ar';

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

function DebtorDetail(): ReactElement {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { data: debtor, isLoading } = useDebtor(id);

  return (
    <div className="min-h-screen bg-paper text-ink">
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
