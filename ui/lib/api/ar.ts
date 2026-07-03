'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { AGING_BUCKETS, formatCents } from './ar-format';
import type { AgingBucket } from './ar-format';

export type { AgingBucket };
export { AGING_BUCKETS, formatCents };

export interface ArSummary {
  totalOutstandingCents: number;
  overdueCents: number;
  debtorCount: number;
  openInvoiceCount: number;
  aging: Record<AgingBucket, { count: number; amountCents: number }>;
}
export interface DebtorRow {
  id: string;
  name: string;
  email: string | null;
  outstandingCents: number;
  worstOverdueDays: number;
  openInvoiceCount: number;
}
export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  amountDueCents: number;
  status: string;
  overdueDays: number;
  bucket: AgingBucket;
}
export interface DebtorDetail {
  id: string;
  name: string;
  email: string | null;
  invoices: InvoiceRow[];
}

export function useArSummary() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['ar', 'summary'],
    queryFn: async () => apiFetch<ArSummary>('/ar/summary', await getToken()),
  });
}

export function useDebtors() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['ar', 'debtors'],
    queryFn: async () => apiFetch<DebtorRow[]>('/ar/debtors', await getToken()),
  });
}

export function useDebtor(id: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['ar', 'debtor', id],
    queryFn: async () => apiFetch<DebtorDetail>(`/ar/debtors/${id}`, await getToken()),
    enabled: !!id,
  });
}

export function useSyncAr() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<{ debtors: number; invoices: number }>('/ar/sync', await getToken(), {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ar'] }),
  });
}
