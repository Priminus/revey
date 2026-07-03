import { render, screen } from '@testing-library/react';
import { FlowTimeline } from './flow-timeline';
import type { FlowStep, Template } from '../lib/api/config-format';

const steps: FlowStep[] = [
  { id: 's1', offsetDays: -7, order: 0, templateId: 't1' },
  { id: 's2', offsetDays: 14, order: 1, templateId: 't2' },
];

const templates: Template[] = [
  { id: 't1', name: 'First reminder', subject: 'Subject 1', body: 'Body 1', scope: 'global' },
  { id: 't2', name: 'Second reminder', subject: 'Subject 2', body: 'Body 2', scope: 'global' },
];

describe('FlowTimeline', () => {
  it('renders a card per step with the correct offset labels and a Save button', () => {
    render(
      <FlowTimeline steps={steps} templates={templates} onSave={jest.fn()} saving={false} />,
    );

    expect(screen.getByText('7d before due')).toBeInTheDocument();
    expect(screen.getByText('14d overdue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
