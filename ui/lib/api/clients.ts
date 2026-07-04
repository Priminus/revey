'use client';

import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export interface Client {
  id: string;
  name: string;
}

export function useClients() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => apiFetch<Client[]>('/clients', await getToken()),
  });
}
