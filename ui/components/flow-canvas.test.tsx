import { render, screen } from '@testing-library/react';
import { FlowCanvas } from './flow-canvas';
import type { FlowStep, Template } from '../lib/api/config-format';

const steps: FlowStep[] = [
  { id: 's1', offsetDays: -7, order: 0, templateId: 't1' },
  { id: 's2', offsetDays: 14, order: 1, templateId: 't2' },
];

const templates: Template[] = [
  { id: 't1', name: 'First reminder', subject: 'Subject 1', body: 'Body 1', scope: 'global' },
  { id: 't2', name: 'Second reminder', subject: 'Subject 2', body: 'Body 2', scope: 'global' },
];

describe('FlowCanvas', () => {
  it('mounts the node graph without throwing and renders step nodes, controls, and the trigger/end nodes', () => {
    render(
      <FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving={false} />,
    );

    expect(screen.getByText('Invoice becomes overdue')).toBeInTheDocument();
    expect(screen.getByText('✓ Paid / escalate to human')).toBeInTheDocument();
    expect(screen.getByText('First reminder')).toBeInTheDocument();
    expect(screen.getByText('Second reminder')).toBeInTheDocument();
    expect(screen.getByText('7d before due')).toBeInTheDocument();
    expect(screen.getByText('14d overdue')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '+ Add step' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('hides the inspector, add, and save controls in readOnly mode', () => {
    render(
      <FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving={false} readOnly />,
    );

    expect(screen.queryByRole('button', { name: '+ Add step' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
