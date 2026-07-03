'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, type ReactElement } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignedIn, SignedOut, RedirectToSignIn, useAuth } from '@clerk/nextjs';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface XeroStatus {
  connected: boolean;
  xeroTenantId?: string;
}

function XeroStatusBanner(): ReactElement | null {
  const searchParams = useSearchParams();
  const xero = searchParams.get('xero');

  if (xero === 'connected') {
    return (
      <div className="mb-4 rounded-[14px] border border-line bg-paid-soft px-4 py-2 text-sm text-paid-deep">
        Xero connected successfully.
      </div>
    );
  }
  if (xero === 'error') {
    return (
      <div className="mb-4 rounded-[14px] border border-line bg-danger-soft px-4 py-2 text-sm text-danger">
        Failed to connect Xero. Please try again.
      </div>
    );
  }
  return null;
}

function XeroConnectionCard(): ReactElement {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<XeroStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus(): Promise<void> {
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
        if (!cancelled) {
          setError('Could not reach the Revey API.');
        }
      }
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const handleConnect = async (): Promise<void> => {
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
  };

  return (
    <Card className="flex max-w-md items-center justify-between">
      <div>
        <p className="font-display font-semibold">Xero</p>
        <p className="text-sm text-muted">Accounting &amp; AR data source</p>
        {status?.connected && (
          <div className="mt-2">
            <Badge tone="paid">Connected · {status.xeroTenantId}</Badge>
          </div>
        )}
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
      {!status?.connected && <Button onClick={() => void handleConnect()}>Connect Xero</Button>}
    </Card>
  );
}

export default function ConnectionsPage(): ReactElement {
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
                  <Link href="/connections" className="text-ink">
                    Connections
                  </Link>
                  <Link href="/approvals" className="transition-colors duration-200 hover:text-ink">
                    Approvals
                  </Link>
                  <Link href="/templates" className="transition-colors duration-200 hover:text-ink">
                    Templates
                  </Link>
                  <Link href="/workflow" className="transition-colors duration-200 hover:text-ink">
                    Workflow
                  </Link>
                </nav>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-(--maxw) px-6 py-8">
            <h1 className="mb-4 text-[1.75rem] font-semibold">Connections</h1>
            <Suspense fallback={null}>
              <XeroStatusBanner />
            </Suspense>
            <XeroConnectionCard />
          </main>
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
