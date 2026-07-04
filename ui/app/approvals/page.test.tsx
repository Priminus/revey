import { render, screen } from '@testing-library/react';
import ApprovalsPage from './page';
import type { DraftRow } from '../../lib/api/ar-format';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/approvals',
}));

jest.mock('../../lib/api/clients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Test Co' }], isLoading: false }),
}));

jest.mock('../../lib/client-context', () => ({
  useActiveClient: () => ({ activeClientId: 'c1', setActiveClientId: jest.fn() }),
}));

const draft: DraftRow = {
  id: 'd1',
  debtorId: 'deb1',
  debtorName: 'Acme Co',
  subject: 'Friendly reminder: Invoice INV-001',
  body: 'Hi Acme, just a nudge on your outstanding invoice.',
  status: 'pending',
  toEmailIntended: 'ap@acme.co',
  toEmailActual: null,
  scoreValueAtDraft: 62,
  error: null,
  sentAt: null,
  createdAt: '2026-07-01T00:00:00Z',
};

const useDraftsMock = jest.fn();

jest.mock('../../lib/api/ar', () => {
  const actual = jest.requireActual('../../lib/api/ar-format');
  return {
    ...actual,
    useDrafts: () => useDraftsMock(),
    useEditDraft: () => ({ mutate: jest.fn(), isPending: false }),
    useApproveDraft: () => ({ mutate: jest.fn(), isPending: false, data: undefined, error: undefined }),
    useRejectDraft: () => ({ mutate: jest.fn(), isPending: false, data: undefined, error: undefined }),
  };
});

describe('ApprovalsPage', () => {
  it('renders a pending draft with its subject and the Approve & Send action', () => {
    useDraftsMock.mockReturnValue({ data: [draft], isLoading: false });
    render(<ApprovalsPage />);
    expect(screen.getByDisplayValue(draft.subject)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve & Send' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no pending drafts', () => {
    useDraftsMock.mockReturnValue({ data: [], isLoading: false });
    render(<ApprovalsPage />);
    expect(screen.getByText('No drafts awaiting approval.')).toBeInTheDocument();
  });
});
