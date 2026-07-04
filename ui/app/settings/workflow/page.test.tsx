import { render, screen } from '@testing-library/react';
import GlobalWorkflowPage from './page';
import type { EffectiveFlow, Template } from '../../../lib/api/config-format';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/settings/workflow',
}));

jest.mock('../../../lib/api/clients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Test Co' }], isLoading: false }),
}));

jest.mock('../../../lib/client-context', () => ({
  useActiveClient: () => ({ activeClientId: 'c1', setActiveClientId: jest.fn() }),
}));

const useFlowMock = jest.fn();
const useTemplatesMock = jest.fn();
const saveStepsMutate = jest.fn();

jest.mock('../../../lib/api/config', () => {
  const actual = jest.requireActual('../../../lib/api/config-format');
  return {
    ...actual,
    useFlow: () => useFlowMock(),
    useTemplates: () => useTemplatesMock(),
    useSaveSteps: () => ({ mutate: saveStepsMutate, isPending: false }),
  };
});

const flow: EffectiveFlow = { flowId: 'g', isOverride: false, steps: [] };
const templates: Template[] = [];

describe('GlobalWorkflowPage', () => {
  beforeEach(() => {
    useFlowMock.mockReturnValue({ data: flow, isLoading: false });
    useTemplatesMock.mockReturnValue({ data: templates, isLoading: false });
  });

  it('renders the global workflow heading and mounts an editable flow canvas', () => {
    render(<GlobalWorkflowPage />);
    expect(screen.getByRole('heading', { name: 'Global workflow' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Workflow editor actions' })).toBeInTheDocument();
  });

  it('has no Customize or Reset to global controls (it is the global scope itself)', () => {
    render(<GlobalWorkflowPage />);
    expect(screen.queryByRole('button', { name: 'Customize' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset to global' })).not.toBeInTheDocument();
  });
});
