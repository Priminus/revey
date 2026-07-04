import { fireEvent, render, screen } from '@testing-library/react';
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
    render(<FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving={false} />);

    expect(screen.getByText('Invoice becomes overdue')).toBeInTheDocument();
    expect(screen.getByText('✓ Paid / escalate to human')).toBeInTheDocument();
    expect(screen.getByText('First reminder')).toBeInTheDocument();
    expect(screen.getByText('Second reminder')).toBeInTheDocument();
    expect(screen.getByText('7d before due')).toBeInTheDocument();
    expect(screen.getByText('14d overdue')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '+ Add step' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
  });

  it('hides the inspector, add, undo/redo, and save controls in readOnly mode', () => {
    render(<FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving={false} readOnly />);

    expect(screen.queryByRole('button', { name: '+ Add step' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Redo' })).not.toBeInTheDocument();
  });

  it('disables Save with no unsaved changes, and enables it (with undo available) after removing a step', () => {
    render(<FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving={false} />);

    const saveButton = screen.getByRole('button', { name: 'Save changes' });
    const undoButton = screen.getByRole('button', { name: 'Undo' });
    expect(saveButton).toBeDisabled();
    expect(undoButton).toBeDisabled();

    // React Flow renders nodes with visibility:hidden until it measures them
    // in jsdom (no real layout), which makes their accessible name resolve
    // to empty for role queries — query by the aria-label attribute instead.
    const removeButtons = screen.getAllByLabelText('Remove step');
    fireEvent.click(removeButtons[0]);

    expect(saveButton).toBeEnabled();
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    expect(undoButton).toBeEnabled();

    // Undo restores the removed step and disables Save again.
    fireEvent.click(undoButton);
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('First reminder')).toBeInTheDocument();
  });

  it('calls onSave with the sorted, ordered working steps when Save is clicked', () => {
    const onSave = jest.fn();
    render(<FlowCanvas steps={steps} templates={templates} onSave={onSave} saving={false} />);

    fireEvent.click(screen.getAllByLabelText('Remove step')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith([{ offsetDays: 14, templateId: 't2', order: 0 }]);
  });

  it('shows "Saving…" while a save is in flight', () => {
    render(<FlowCanvas steps={steps} templates={templates} onSave={jest.fn()} saving />);

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
  });
});
