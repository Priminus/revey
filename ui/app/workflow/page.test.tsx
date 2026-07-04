import { render, screen } from '@testing-library/react';
import WorkflowPage from './page';
import type { EffectiveFlow, Template } from '../../lib/api/config-format';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/workflow',
}));

jest.mock('../../lib/api/clients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Test Co' }], isLoading: false }),
}));

jest.mock('../../lib/client-context', () => ({
  useActiveClient: () => ({ activeClientId: 'c1', setActiveClientId: jest.fn() }),
}));

const useFlowMock = jest.fn();
const useTemplatesMock = jest.fn();
const saveStepsMutate = jest.fn();
const customizeMutate = jest.fn();
const resetMutate = jest.fn();

jest.mock('../../lib/api/config', () => {
  const actual = jest.requireActual('../../lib/api/config-format');
  return {
    ...actual,
    useFlow: () => useFlowMock(),
    useTemplates: () => useTemplatesMock(),
    useSaveSteps: () => ({ mutate: saveStepsMutate, isPending: false }),
    useCustomizeFlow: () => ({ mutate: customizeMutate, isPending: false }),
    useResetFlow: () => ({ mutate: resetMutate, isPending: false }),
  };
});

const templates: Template[] = [];

describe('WorkflowPage', () => {
  it('renders a Workflow heading without a global/client scope switch', () => {
    useFlowMock.mockReturnValue({
      data: { flowId: 'g', isOverride: false, steps: [] } satisfies EffectiveFlow,
      isLoading: false,
    });
    useTemplatesMock.mockReturnValue({ data: templates, isLoading: false });

    render(<WorkflowPage />);
    expect(screen.getByRole('heading', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.queryByText('Global')).not.toBeInTheDocument();
    expect(screen.queryByText('This client')).not.toBeInTheDocument();
  });

  it('shows a Customize action when the client is inheriting the global flow', () => {
    useFlowMock.mockReturnValue({
      data: { flowId: 'g', isOverride: false, steps: [] } satisfies EffectiveFlow,
      isLoading: false,
    });
    useTemplatesMock.mockReturnValue({ data: templates, isLoading: false });

    render(<WorkflowPage />);
    expect(screen.getByRole('button', { name: 'Customize' })).toBeInTheDocument();
  });

  it('shows a Reset to global action once the client has its own override', () => {
    useFlowMock.mockReturnValue({
      data: { flowId: 'c', isOverride: true, steps: [] } satisfies EffectiveFlow,
      isLoading: false,
    });
    useTemplatesMock.mockReturnValue({ data: templates, isLoading: false });

    render(<WorkflowPage />);
    expect(screen.getByRole('button', { name: 'Reset to global' })).toBeInTheDocument();
  });
});
