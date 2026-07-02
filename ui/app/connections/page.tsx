'use client';

import { Suspense, useEffect, useState, type ReactElement } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignedIn, SignedOut, RedirectToSignIn, useAuth } from '@clerk/nextjs';

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
      <div className="mb-4 rounded bg-green-100 text-green-800 px-4 py-2 text-sm">
        Xero connected successfully.
      </div>
    );
  }
  if (xero === 'error') {
    return (
      <div className="mb-4 rounded bg-red-100 text-red-800 px-4 py-2 text-sm">
        Failed to connect Xero. Please try again.
      </div>
    );
  }
  return null;
}

function XeroConnectionCard(): ReactElement {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<XeroStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus(): Promise<void> {
      const token = await getToken();
      const res = await fetch(`${API_URL}/integrations/xero/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as XeroStatus;
      if (!cancelled) {
        setStatus(data);
      }
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const handleConnect = async (): Promise<void> => {
    const token = await getToken();
    const res = await fetch(`${API_URL}/integrations/xero/connect`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { authorizeUrl } = (await res.json()) as { authorizeUrl: string };
    window.location.href = authorizeUrl;
  };

  return (
    <div className="border rounded p-4 flex items-center justify-between max-w-md">
      <div>
        <p className="font-medium">Xero</p>
        <p className="text-sm text-gray-500">Accounting &amp; AR data source</p>
        {status?.connected && (
          <p className="text-sm text-green-700 mt-1">
            Connected to Xero (org: {status.xeroTenantId})
          </p>
        )}
      </div>
      {!status?.connected && (
        <button
          onClick={() => void handleConnect()}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Connect Xero
        </button>
      )}
    </div>
  );
}

export default function ConnectionsPage(): ReactElement {
  return (
    <main className="p-8">
      <SignedIn>
        <h1 className="text-2xl font-bold mb-4">Connections</h1>
        <Suspense fallback={null}>
          <XeroStatusBanner />
        </Suspense>
        <XeroConnectionCard />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </main>
  );
}
