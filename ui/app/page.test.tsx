import { render, screen } from '@testing-library/react';
import Home from './page';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
}));

jest.mock('../lib/api/ar', () => {
  const actual = jest.requireActual('../lib/api/ar-format');
  return {
    ...actual,
    useArSummary: () => ({ data: undefined, isLoading: false }),
    useDebtors: () => ({ data: [], isLoading: false }),
    useSyncAr: () => ({ mutate: jest.fn(), isPending: false, data: undefined, error: undefined }),
    useScoreAll: () => ({ mutate: jest.fn(), isPending: false, data: undefined, error: undefined }),
  };
});

describe('Home', () => {
  it('renders the dashboard heading and Sync from Xero button for signed-in users', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Revey')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync from Xero' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no debtors', () => {
    render(<Home />);
    expect(screen.getByText(/No AR yet — connect Xero and Sync/)).toBeInTheDocument();
  });
});
