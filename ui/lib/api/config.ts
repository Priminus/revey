'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { renderPreview, SAMPLE_VARS } from './config-format';
import type { EffectiveFlow, FlowScope, FlowStep, Template } from './config-format';

export type { EffectiveFlow, FlowScope, FlowStep, Template };
export { renderPreview, SAMPLE_VARS };

export function useTemplates() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['config', 'templates'],
    queryFn: async () => apiFetch<Template[]>('/config/templates', await getToken()),
  });
}

export interface SaveTemplateInput {
  id?: string;
  scope: FlowScope;
  name: string;
  subject: string;
  body: string;
}

export function useSaveTemplate() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scope, name, subject, body }: SaveTemplateInput) => {
      const token = await getToken();
      if (id) {
        return apiFetch<Template>(`/config/templates/${id}`, token, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, subject, body }),
        });
      }
      return apiFetch<Template>('/config/templates', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, name, subject, body }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}

export function useDeleteTemplate() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/config/templates/${id}`, await getToken(), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}

export function useFlow(scope: FlowScope) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['config', 'flow', scope],
    queryFn: async () =>
      apiFetch<EffectiveFlow>(`/config/flow?scope=${scope}`, await getToken()),
  });
}

export interface SaveStepsInput {
  offsetDays: number;
  templateId: string;
  order: number;
}

export function useSaveSteps(scope: FlowScope) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (steps: SaveStepsInput[]) =>
      apiFetch<void>(`/config/flow/steps?scope=${scope}`, await getToken(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}

export function useCustomizeFlow() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<void>('/config/flow/customize', await getToken(), { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}

export function useResetFlow() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<void>('/config/flow', await getToken(), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}
