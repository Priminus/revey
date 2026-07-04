import { render, screen } from '@testing-library/react';
import DebtorDetailPage from './page';
import type { DebtorDetail } from '../../../lib/api/ar';
import type { RunResult } from '../../../lib/api/config-format';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/debtors/deb1',
  useParams: () => ({ id: 'deb1' }),
}));

jest.mock('../../../lib/api/clients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Test Co' }], isLoading: false }),
}));

jest.mock('../../../lib/client-context', () => ({
  useActiveClient: () => ({ activeClientId: 'c1', setActiveClientId: jest.fn() }),
}));

const debtor: DebtorDetail = {
  id: 'deb1',
  name: 'Acme Co',
  email: 'ap@acme.co',
  invoices: [],
  scoreValue: 62,
  scoreBand: 'uncertain',
  recommendedAction: 'send_reminder',
  scoreRationale: 'Slow payer, one invoice 45 days overdue.',
  interactions: [],
};

const useDebtorMock = jest.fn();

jest.mock('../../../lib/api/ar', () => {
  const actual = jest.requireActual('../../../lib/api/ar-format');
  return {
    ...actual,
    useDebtor: () => useDebtorMock(),
  };
});

const useRunOutreachMock = jest.fn();

jest.mock('../../../lib/api/config', () => {
  const actual = jest.requireActual('../../../lib/api/config-format');
  return {
    ...actual,
    useRunOutreach: () => useRunOutreachMock(),
  };
});

describe('DebtorDetailPage', () => {
  beforeEach(() => {
    useDebtorMock.mockReturnValue({ data: debtor, isLoading: false });
  });

  it('renders the Send outreach button', () => {
    useRunOutreachMock.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      data: undefined,
      error: undefined,
    });
    render(<DebtorDetailPage />);
    expect(screen.getByRole('button', { name: 'Send outreach' })).toBeInTheDocument();
  });

  it('shows the sent confirmation when auto-send delivered the outreach', () => {
    const result: RunResult = {
      draftId: 'd1',
      autoSent: true,
      result: { status: 'sent' },
    };
    useRunOutreachMock.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      data: result,
      error: undefined,
    });
    render(<DebtorDetailPage />);
    expect(screen.getByText('Sent ✓ (test mode → your inbox)')).toBeInTheDocument();
  });

  it('shows the failure message when auto-send failed', () => {
    const result: RunResult = {
      draftId: 'd1',
      autoSent: true,
      result: { status: 'failed', error: 'SMTP timeout' },
    };
    useRunOutreachMock.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      data: result,
      error: undefined,
    });
    render(<DebtorDetailPage />);
    expect(screen.getByText('SMTP timeout')).toBeInTheDocument();
  });

  it('shows the awaiting-approval message with a link to Approvals when auto-send is off', () => {
    const result: RunResult = {
      draftId: 'd1',
      autoSent: false,
    };
    useRunOutreachMock.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      data: result,
      error: undefined,
    });
    render(<DebtorDetailPage />);
    expect(screen.getByText(/Drafted — awaiting approval/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'review it in Approvals' })).toHaveAttribute(
      'href',
      '/approvals',
    );
  });
});
