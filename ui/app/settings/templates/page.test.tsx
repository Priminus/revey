import { render, screen, fireEvent } from '@testing-library/react';
import TemplatesPage from './page';
import type { Template } from '../../../lib/api/config-format';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/settings/templates',
}));

jest.mock('../../../lib/api/clients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Test Co' }], isLoading: false }),
}));

jest.mock('../../../lib/client-context', () => ({
  useActiveClient: () => ({ activeClientId: 'c1', setActiveClientId: jest.fn() }),
}));

const templates: Template[] = [
  {
    id: 't1',
    name: 'First reminder',
    subject: 'Invoice reminder for {{debtor_name}}',
    body: 'Hi {{debtor_name}}, you owe {{outstanding_amount}}.',
    scope: 'global',
  },
  {
    id: 't2',
    name: 'Client-specific nudge',
    subject: 'Payment overdue',
    body: 'Please pay {{outstanding_amount}} for invoices: {{invoice_list}}',
    scope: 'client',
  },
];

const useTemplatesMock = jest.fn();
const saveMutate = jest.fn();
const deleteMutate = jest.fn();

jest.mock('../../../lib/api/config', () => {
  const actual = jest.requireActual('../../../lib/api/config-format');
  return {
    ...actual,
    useTemplates: () => useTemplatesMock(),
    useSaveTemplate: () => ({ mutate: saveMutate, isPending: false, error: undefined }),
    useDeleteTemplate: () => ({ mutate: deleteMutate, isPending: false, error: undefined }),
  };
});

describe('TemplatesPage (settings)', () => {
  beforeEach(() => {
    useTemplatesMock.mockReturnValue({ data: templates, isLoading: false });
  });

  it('renders a Templates heading and a New template control', () => {
    render(<TemplatesPage />);
    expect(screen.getByRole('heading', { name: 'Templates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New template' })).toBeInTheDocument();
  });

  it('shows a live preview containing the sample debtor name after selecting a template', () => {
    render(<TemplatesPage />);
    fireEvent.click(screen.getByText('First reminder'));
    expect(screen.getAllByText(/Harbour Logistics Pte Ltd/).length).toBeGreaterThan(0);
  });
});
