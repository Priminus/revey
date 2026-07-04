'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { setActiveClientHeader } from './api/client';
import { useClients } from './api/clients';

const STORAGE_KEY = 'revey.activeClientId';

interface ClientContextValue {
  activeClientId: string | null;
  setActiveClientId: (id: string) => void;
}

const ClientContext = createContext<ClientContextValue | null>(null);

function readStoredClientId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

/**
 * Owns which client is "active" across the app (dashboard, debtors,
 * approvals, that client's workflow all follow it). Persists the selection
 * to localStorage and pushes it down to `apiFetch` via
 * `setActiveClientHeader` so every request carries `X-Client-Id`. Whenever
 * the active client changes, invalidates all React Query caches so
 * client-scoped data refetches under the new client.
 */
export function ClientProvider({ children }: { children: ReactNode }): ReactElement {
  const queryClient = useQueryClient();
  const { data: clients } = useClients();
  const [activeClientId, setActiveClientIdState] = useState<string | null>(readStoredClientId);

  // Keep track of the last client id we've synced onto the `apiFetch`
  // module-level header, and sync during render (not in an effect) so the
  // header is correct before children mount and fire their first queries.
  // This closes the mount-time race where a persisted non-default client
  // would otherwise be applied only after first paint, letting the initial
  // fetch go out unscoped.
  const lastSyncedRef = useRef<string | null | undefined>(undefined);
  if (lastSyncedRef.current !== activeClientId) {
    setActiveClientHeader(activeClientId);
    lastSyncedRef.current = activeClientId;
  }

  // Default to the first client returned once loaded, if nothing was
  // stored/selected yet.
  useEffect(() => {
    if (activeClientId || !clients || clients.length === 0) return;
    setActiveClientIdState(clients[0].id);
  }, [clients, activeClientId]);

  // Persist to localStorage and invalidate React Query caches whenever the
  // active client actually changes. Skipped on the very first run since the
  // render-body sync above already applied the header for the initial
  // value — invalidating here too would trigger a redundant double-fetch.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (activeClientId && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, activeClientId);
    }
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    void queryClient.invalidateQueries();
  }, [activeClientId, queryClient]);

  const setActiveClientId = (id: string): void => {
    setActiveClientIdState(id);
  };

  return (
    <ClientContext.Provider value={{ activeClientId, setActiveClientId }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useActiveClient(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    throw new Error('useActiveClient must be used within a ClientProvider');
  }
  return ctx;
}
