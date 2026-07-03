'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { AGING_BUCKETS, formatCents, scoreBandTone } from './ar-format';
import type { AgingBucket, DraftRow, ScoreBand } from './ar-format';

export type { AgingBucket, DraftRow, ScoreBand };
export { AGING_BUCKETS, formatCents, scoreBandTone };

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
  scoreValue: number | null;
  scoreBand: ScoreBand | null;
  recommendedAction: string | null;
  scoreRationale: string | null;
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
export interface InteractionRow {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
}
export interface DebtorDetail {
  id: string;
  name: string;
  email: string | null;
  invoices: InvoiceRow[];
  scoreValue: number | null;
  scoreBand: ScoreBand | null;
  recommendedAction: string | null;
  scoreRationale: string | null;
  interactions: InteractionRow[];
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

export interface ScoreResult {
  scoreValue: number;
  scoreBand: ScoreBand;
  recommendedAction: string;
  rationale: string;
}

export function useScoreAll() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<{ scored: number; failed: number }>('/agent/score', await getToken(), {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar'] });
      qc.invalidateQueries({ queryKey: ['agent'] });
    },
  });
}

export function useScoreDebtor(id: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<ScoreResult>(`/agent/debtors/${id}/score`, await getToken(), { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar'] });
      qc.invalidateQueries({ queryKey: ['agent'] });
    },
  });
}

export function useDraftDebtor(id: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<{ id: string }>(`/agent/debtors/${id}/draft`, await getToken(), { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent'] });
    },
  });
}

export function useDrafts() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['agent', 'drafts'],
    queryFn: async () => apiFetch<DraftRow[]>('/agent/drafts', await getToken()),
  });
}

export function useEditDraft() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      subject,
      body,
    }: {
      id: string;
      subject?: string;
      body?: string;
    }) =>
      apiFetch<void>(`/agent/drafts/${id}`, await getToken(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'drafts'] }),
  });
}

export function useApproveDraft() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<{ status: 'sent' | 'failed'; error?: string }>(
        `/agent/drafts/${id}/approve`,
        await getToken(),
        { method: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'drafts'] }),
  });
}

export function useRejectDraft() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/agent/drafts/${id}/reject`, await getToken(), { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'drafts'] }),
  });
}
