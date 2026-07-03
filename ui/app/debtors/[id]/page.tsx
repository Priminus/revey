'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { useDebtor, formatCents } from '@/lib/api/ar';

function DebtorDetail(): ReactElement {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { data: debtor, isLoading } = useDebtor(id);

  return (
    <div className="min-h-screen bg-[#f9f9f7] dark:bg-[#0d0d0d] text-[#0b0b0b] dark:text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#2a78d6] hover:underline mb-6"
        >
          ← Back to dashboard
        </Link>

        {isLoading && <p className="text-sm text-[#898781]">Loading debtor…</p>}

        {!isLoading && !debtor && (
          <p className="text-sm text-[#898781]">Debtor not found.</p>
        )}

        {debtor && (
          <>
            <h1 className="text-2xl font-bold">{debtor.name}</h1>
            <p className="text-sm text-[#898781] mt-1">{debtor.email ?? 'No email on file'}</p>

            <div className="mt-6 rounded-xl border border-black/10 dark:border-white/10 bg-[#fcfcfb] dark:bg-[#1a1a19] px-6 py-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#898781] mb-3">
                Invoices
              </h2>
              {debtor.invoices.length === 0 ? (
                <p className="text-sm text-[#898781] py-6 text-center">No invoices on file.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-black/10 dark:border-white/10 text-left text-[11px] uppercase tracking-[0.1em] text-[#898781]">
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
                          className="border-b border-black/5 dark:border-white/5 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium">{invoice.invoiceNumber}</td>
                          <td className="py-3 pr-4 text-[#52514e]">{invoice.issueDate}</td>
                          <td className="py-3 pr-4 text-[#52514e]">{invoice.dueDate}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {formatCents(invoice.totalCents)}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {formatCents(invoice.amountDueCents)}
                          </td>
                          <td className="py-3 pr-4 text-[#52514e]">{invoice.status}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {invoice.overdueDays > 0 ? `${invoice.overdueDays}d` : '—'}
                          </td>
                          <td className="py-3 pr-4 text-[#52514e]">{invoice.bucket}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
