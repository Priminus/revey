import { fireEvent, render, screen } from '@testing-library/react';
import { FlowCanvas } from './flow-canvas';
import type { FlowStep, Template } from '../lib/api/config-format';

const steps: FlowStep[] = [
  {
    id: 's1',
    offsetDays: -7,
    order: 0,
    templateId: 't1',
    templateName: 'First reminder',
    requireApproval: true,
    type: 'reminder',
    config: null,
  },
  {
    id: 's2',
    offsetDays: 0,
    order: 1,
    templateId: null,
    requireApproval: false,
    type: 'wait',
    config: { days: 5 },
  },
];

const templates: Template[] = [
  { id: 't1', name: 'First reminder', subject: 'Subject 1', body: 'Body 1', scope: 'global' },
  { id: 't2', name: 'Second reminder', subject: 'Subject 2', body: 'Body 2', scope: 'global' },
];

describe('FlowCanvas', () => {
  it('renders typed step nodes (reminder + wait), add-node palette, trigger/end, and controls', () => {
    render(<FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving={false} />);

    expect(screen.getByText('Invoice becomes overdue')).toBeInTheDocument();
    expect(screen.getByText('✓ Paid / resolved')).toBeInTheDocument();

    // Reminder node summary: offset label + template name.
    expect(screen.getByText('7d before due · First reminder')).toBeInTheDocument();
    // Wait node summary.
    expect(screen.getByText('Wait 5 days')).toBeInTheDocument();

    // Add-node palette (leading icon is aria-hidden, so the accessible name
    // is just "+ <Type>").
    expect(screen.getByRole('button', { name: '+ Reminder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Wait' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Condition' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Escalate' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
  });

  it('hides the palette, inspector, undo/redo, and save controls in readOnly mode', () => {
    render(<FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving={false} readOnly />);

    expect(screen.queryByRole('button', { name: '+ Reminder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Redo' })).not.toBeInTheDocument();
  });

  it('disables Save with no changes, enables it after removing a node, and undoes the removal', () => {
    render(<FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving={false} />);

    const saveButton = screen.getByRole('button', { name: 'Save changes' });
    const undoButton = screen.getByRole('button', { name: 'Undo' });
    expect(saveButton).toBeDisabled();
    expect(undoButton).toBeDisabled();

    // React Flow renders nodes with visibility:hidden until measured in jsdom;
    // query by the aria-label attribute instead of accessible role name.
    const removeButtons = screen.getAllByLabelText('Remove step');
    fireEvent.click(removeButtons[0]);

    expect(saveButton).toBeEnabled();
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    expect(undoButton).toBeEnabled();

    fireEvent.click(undoButton);
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('7d before due · First reminder')).toBeInTheDocument();
  });

  it('adds a typed node from the palette and marks the flow dirty', () => {
    render(<FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving={false} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Escalate' }));

    expect(screen.getByText('Escalate to human')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('calls onSave with typed, ordered SaveStepsInput when Save is clicked', () => {
    const onSave = jest.fn();
    render(<FlowCanvas steps={steps} templates={templates} onSave={onSave} saving={false} />);

    fireEvent.click(screen.getAllByLabelText('Remove step')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith([
      { offsetDays: 0, templateId: null, order: 0, requireApproval: false, type: 'wait', config: { days: 5 } },
    ]);
  });

  it('shows "Saving…" while a save is in flight', () => {
    render(<FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving />);

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
  });
});
