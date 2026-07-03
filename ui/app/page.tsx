'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn, OrganizationSwitcher } from '@clerk/nextjs';
import { AgingChart } from '@/components/aging-chart';
import { KpiTile } from '@/components/kpi-tile';
import { useArSummary, useDebtors, useSyncAr, formatCents } from '@/lib/api/ar';

function SyncButton(): ReactElement {
  const { mutate, isPending, data, error } = useSyncAr();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={() => mutate()}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-[#2a78d6] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#256abf] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Syncing…' : 'Sync from Xero'}
      </button>
      {data && (
        <p className="text-xs text-[#0ca30c]">
          Synced {data.debtors.toLocaleString('en-US')} debtors · {data.invoices.toLocaleString('en-US')} invoices
        </p>
      )}
      {error && <p className="text-xs text-[#d03b3b]">{(error as Error).message}</p>}
    </div>
  );
}

function DebtorsTable(): ReactElement {
  const { data: debtors, isLoading } = useDebtors();

  if (isLoading) {
    return <p className="text-sm text-[#898781] py-8 text-center">Loading debtors…</p>;
  }

  if (!debtors || debtors.length === 0) {
    return (
      <p className="text-sm text-[#898781] py-8 text-center">
        No AR yet — connect Xero and Sync.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 dark:border-white/10 text-left text-[11px] uppercase tracking-[0.1em] text-[#898781]">
            <th className="py-2 pr-4 font-semibold">Debtor</th>
            <th className="py-2 pr-4 font-semibold">Email</th>
            <th className="py-2 pr-4 font-semibold text-right">Outstanding</th>
            <th className="py-2 pr-4 font-semibold text-right">Worst overdue</th>
            <th className="py-2 pr-4 font-semibold text-right">Open invoices</th>
          </tr>
        </thead>
        <tbody>
          {debtors.map((debtor) => (
            <tr
              key={debtor.id}
              className="border-b border-black/5 dark:border-white/5 last:border-0"
            >
              <td className="py-3 pr-4 font-medium">
                <Link
                  href={`/debtors/${debtor.id}`}
                  className="text-[#2a78d6] hover:underline"
                >
                  {debtor.name}
                </Link>
              </td>
              <td className="py-3 pr-4 text-[#52514e]">{debtor.email ?? '—'}</td>
              <td className="py-3 pr-4 text-right tabular-nums">
                {formatCents(debtor.outstandingCents)}
              </td>
              <td className="py-3 pr-4 text-right tabular-nums">
                {debtor.worstOverdueDays > 0 ? `${debtor.worstOverdueDays}d` : '—'}
              </td>
              <td className="py-3 pr-4 text-right tabular-nums">{debtor.openInvoiceCount}</td>
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
    <div className="min-h-screen bg-[#f9f9f7] dark:bg-[#0d0d0d] text-[#0b0b0b] dark:text-white">
      <header className="border-b border-black/10 dark:border-white/10 bg-[#fcfcfb] dark:bg-[#1a1a19]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="text-lg font-bold tracking-[-0.01em]">Revey</span>
            <nav className="flex items-center gap-5 text-sm font-medium text-[#52514e]">
              <Link href="/" className="text-[#0b0b0b] dark:text-white">
                Dashboard
              </Link>
              <Link href="/connections" className="hover:text-[#0b0b0b] dark:hover:text-white">
                Connections
              </Link>
            </nav>
          </div>
          <OrganizationSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-[#898781] mt-1">
              Accounts receivable, aging, and outreach at a glance.
            </p>
          </div>
          <SyncButton />
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

        <div className="mb-6">{summary && <AgingChart aging={summary.aging} />}</div>

        <div className="rounded-xl border border-black/10 dark:border-white/10 bg-[#fcfcfb] dark:bg-[#1a1a19] px-6 py-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#898781] mb-3">
            Debtors
          </h2>
          <DebtorsTable />
        </div>
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
