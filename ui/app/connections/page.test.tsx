import { render, screen } from '@testing-library/react';
import ConnectionsPage from './page';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
  useAuth: () => ({ getToken: async () => 'tok' }),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/connections',
}));

jest.mock('../../lib/api/clients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Test Co' }], isLoading: false }),
}));

jest.mock('../../lib/client-context', () => ({
  useActiveClient: () => ({ activeClientId: 'c1', setActiveClientId: jest.fn() }),
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ connected: false }),
  }) as unknown as typeof fetch;
});

describe('ConnectionsPage', () => {
  it('renders a Connect Xero action', async () => {
    render(<ConnectionsPage />);
    expect(await screen.findByText(/connect xero/i)).toBeInTheDocument();
  });
});
