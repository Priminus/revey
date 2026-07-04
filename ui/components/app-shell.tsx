'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useClients } from '@/lib/api/clients';
import { useActiveClient } from '@/lib/client-context';

interface NavItem {
  label: string;
  href: string;
}

// Client-scoped — dashboard, debtors, approvals, and this client's workflow.
// "Debtors" points at "/" (the dashboard table) since there is no standalone
// debtors index route yet.
const WORKSPACE_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Debtors', href: '/' },
  { label: 'Approvals', href: '/approvals' },
  { label: 'Connections', href: '/connections' },
  { label: 'Workflow', href: '/workflow' },
];

// Global — shared across every client, lives once under Settings instead of
// being repeated per client.
const SETTINGS_NAV: NavItem[] = [
  { label: 'Global Workflow', href: '/settings/workflow' },
  { label: 'Templates', href: '/settings/templates' },
];

function ClientSwitcher(): ReactElement {
  const { data: clients } = useClients();
  const { activeClientId, setActiveClientId } = useActiveClient();
  const [open, setOpen] = useState(false);

  const activeClient =
    (clients ?? []).find((c) => c.id === activeClientId) ?? clients?.[0] ?? null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-[14px] border border-line bg-paper px-3 py-2.5 text-left transition-colors duration-200 ease-[cubic-bezier(.22,.61,.36,1)] hover:bg-inset"
      >
        <span className="truncate text-sm font-semibold text-ink">
          {activeClient?.name ?? 'Select client'}
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          ⌄
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Clients"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-y-auto rounded-[14px] border border-line bg-paper py-1 shadow-[0_6px_24px_rgba(10,10,10,0.06)]"
        >
          {(clients ?? []).length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No clients</li>
          )}
          {(clients ?? []).map((client) => (
            <li key={client.id}>
              <button
                type="button"
                role="option"
                aria-selected={client.id === activeClientId}
                onClick={() => {
                  setActiveClientId(client.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-200 ${
                  client.id === activeClientId
                    ? 'font-semibold text-paid'
                    : 'text-ink hover:bg-inset'
                }`}
              >
                {client.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NavSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}): ReactElement {
  return (
    <div className="mb-6">
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {title}
      </p>
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`rounded-[10px] px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                active ? 'bg-paid-tint text-paid-deep' : 'text-muted hover:bg-inset hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-paper px-4 py-5">
        <div className="mb-6 px-1">
          <span className="font-display text-lg font-semibold tracking-[-0.01em]">Revey</span>
        </div>

        <div className="mb-6">
          <ClientSwitcher />
        </div>

        <NavSection title="Workspace" items={WORKSPACE_NAV} pathname={pathname ?? ''} />
        <NavSection title="Settings" items={SETTINGS_NAV} pathname={pathname ?? ''} />
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-(--maxw) px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
