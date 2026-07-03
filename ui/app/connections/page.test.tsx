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
