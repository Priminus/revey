import { render, screen } from '@testing-library/react';
import VendorsPage from './page';
import type { VendorRow } from '../../lib/api/ar-format';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/vendors',
}));

jest.mock('../../lib/api/clients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Test Co' }], isLoading: false }),
}));

jest.mock('../../lib/client-context', () => ({
  useActiveClient: () => ({ activeClientId: 'c1', setActiveClientId: jest.fn() }),
}));

const vendor: VendorRow = {
  id: 'v1',
  name: 'Acme Co',
  email: 'ap@acme.co',
  scoreValue: 24,
  scoreBand: 'at_risk',
  recommendedAction: 'final_notice',
  outstandingCents: 500000,
  openInvoiceCount: 3,
  worstOverdueDays: 92,
};

const useVendorsMock = jest.fn();

jest.mock('../../lib/api/ar', () => {
  const actual = jest.requireActual('../../lib/api/ar-format');
  return {
    ...actual,
    useVendors: () => useVendorsMock(),
    useScoreAllVendors: () => ({
      mutate: jest.fn(),
      isPending: false,
      data: undefined,
      error: undefined,
    }),
  };
});

describe('VendorsPage', () => {
  it('renders the Vendors heading, Refresh scores control, and a scored vendor row', () => {
    useVendorsMock.mockReturnValue({ data: [vendor], isLoading: false });
    render(<VendorsPage />);
    expect(screen.getByRole('heading', { name: 'Vendors' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh scores' })).toBeInTheDocument();
    expect(screen.getByText('Acme Co')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
  });

  it('shows the empty state when there are no vendors', () => {
    useVendorsMock.mockReturnValue({ data: [], isLoading: false });
    render(<VendorsPage />);
    expect(screen.getByText(/No vendors yet/)).toBeInTheDocument();
  });
});
