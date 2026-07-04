import { render, screen, fireEvent } from '@testing-library/react';
import OnboardingPage from './page';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
  useAuth: () => ({ getToken: async () => 'tok' }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/onboarding',
}));

jest.mock('../../lib/api/clients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Test Co' }], isLoading: false }),
}));

jest.mock('../../lib/client-context', () => ({
  useActiveClient: () => ({ activeClientId: 'c1', setActiveClientId: jest.fn() }),
}));

jest.mock('../../lib/api/ar', () => {
  const actual = jest.requireActual('../../lib/api/ar-format');
  return {
    ...actual,
    useVendors: () => ({
      data: [{ id: 'v1', name: 'Harbour Logistics' }],
      isLoading: false,
    }),
  };
});

jest.mock('../../lib/api/config', () => {
  const actual = jest.requireActual('../../lib/api/config-format');
  return {
    ...actual,
    useFlow: () => ({
      data: {
        flowId: 'f1',
        isOverride: false,
        steps: [
          {
            id: 's1',
            offsetDays: -7,
            order: 0,
            templateId: 't1',
            templateName: 'Friendly nudge',
            requireApproval: true,
            type: 'reminder',
            config: null,
          },
        ],
      },
      isLoading: false,
    }),
    useCustomizeFlow: () => ({ mutateAsync: jest.fn(), isPending: false, error: null }),
    useSaveSteps: () => ({ mutateAsync: jest.fn(), isPending: false, error: null }),
    useRunOutreach: () => ({ mutateAsync: jest.fn(), isPending: false }),
  };
});

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ connected: false }),
  }) as unknown as typeof fetch;
});

describe('OnboardingPage', () => {
  it('renders the onboarding heading and the Xero Connect control', async () => {
    render(<OnboardingPage />);
    expect(screen.getByRole('heading', { name: 'Set up Revey' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('shows the WhatsApp Business card as a disabled "Coming soon" option', () => {
    render(<OnboardingPage />);
    expect(screen.getByText('WhatsApp Business')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('renders the Review and Automatic choices on the mode step', () => {
    render(<OnboardingPage />);
    // Navigate to step 3 via the left step list (exact accessible name).
    fireEvent.click(screen.getByRole('button', { name: 'Review or Automatic' }));
    expect(screen.getByText('Review', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Automatic', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });
});
