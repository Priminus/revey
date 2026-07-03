import { render, screen } from '@testing-library/react';
import WorkflowPage from './page';
import type { EffectiveFlow, Template } from '../../lib/api/config-format';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
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

const flow: EffectiveFlow = { flowId: 'g', isOverride: false, steps: [] };
const templates: Template[] = [];

describe('WorkflowPage', () => {
  beforeEach(() => {
    useFlowMock.mockReturnValue({ data: flow, isLoading: false });
    useTemplatesMock.mockReturnValue({ data: templates, isLoading: false });
  });

  it('renders a Workflow heading and the scope switch', () => {
    render(<WorkflowPage />);
    expect(screen.getByRole('heading', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('This client')).toBeInTheDocument();
  });
});
