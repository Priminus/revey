const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// The active client, as selected via the sidebar client switcher. Set by
// `ClientProvider` (see `lib/client-context.tsx`) whenever the user switches
// clients; read here so every `apiFetch` call scopes its request to that
// client via the `X-Client-Id` header. Module-level rather than passed as an
// argument so existing hooks (which only take a token) don't all need to
// thread a client id through.
let activeClientId: string | null = null;

export function setActiveClientHeader(id: string | null): void {
  activeClientId = id;
}

export async function apiFetch<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeClientId ? { 'X-Client-Id': activeClientId } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  // Void endpoints (customize/reset/save-steps/delete) return an empty body;
  // calling res.json() on that throws, so read text and only parse if present.
  const text = await res.text();
  return (text ? (JSON.parse(text) as T) : (undefined as T));
}
