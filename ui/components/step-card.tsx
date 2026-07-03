'use client';

import type { ReactElement } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { offsetLabel, type Template } from '@/lib/api/config-format';

export type OffsetSign = 'before' | 'after';

export interface WorkingStep {
  uid: string;
  id?: string;
  offsetDays: number;
  templateId: string;
}

export interface StepCardPatch {
  offsetDays?: number;
  templateId?: string;
}

interface StepCardProps {
  step: WorkingStep;
  index: number;
  templates: Template[];
  onChange: (patch: StepCardPatch) => void;
  onRemove: () => void;
  readOnly?: boolean;
}

export function StepCard({
  step,
  index,
  templates,
  onChange,
  onRemove,
  readOnly = false,
}: StepCardProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.uid,
    disabled: readOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sign: OffsetSign = step.offsetDays < 0 ? 'before' : 'after';
  const magnitude = Math.abs(step.offsetDays);

  const handleMagnitudeChange = (raw: string): void => {
    const next = Math.max(0, Number.parseInt(raw, 10) || 0);
    onChange({ offsetDays: sign === 'before' ? -next : next });
  };

  const handleSignChange = (nextSign: OffsetSign): void => {
    onChange({ offsetDays: nextSign === 'before' ? -magnitude : magnitude });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex w-64 shrink-0 flex-col gap-3 rounded-[14px] border bg-paper px-4 py-4 ${
        isDragging ? 'border-paid shadow-[0_6px_24px_rgba(10,10,10,0.06)]' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Reorder step ${index + 1}`}
            disabled={readOnly}
            className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-[8px] text-muted transition-colors duration-200 hover:bg-inset hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="3" cy="2.5" r="1.1" fill="currentColor" />
              <circle cx="9" cy="2.5" r="1.1" fill="currentColor" />
              <circle cx="3" cy="6" r="1.1" fill="currentColor" />
              <circle cx="9" cy="6" r="1.1" fill="currentColor" />
              <circle cx="3" cy="9.5" r="1.1" fill="currentColor" />
              <circle cx="9" cy="9.5" r="1.1" fill="currentColor" />
            </svg>
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Step {index + 1}
          </span>
        </div>
        {!readOnly && (
          <button
            type="button"
            aria-label="Remove step"
            onClick={onRemove}
            className="text-muted transition-colors duration-200 hover:text-danger"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      <p className="text-sm font-semibold text-ink">{offsetLabel(step.offsetDays)}</p>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={magnitude}
          disabled={readOnly}
          onChange={(e) => handleMagnitudeChange(e.target.value)}
          aria-label="Days offset"
          className="w-16 rounded-[10px] border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid disabled:bg-inset disabled:text-muted"
        />
        <select
          value={sign}
          disabled={readOnly || magnitude === 0}
          onChange={(e) => handleSignChange(e.target.value as OffsetSign)}
          aria-label="Before or after due date"
          className="flex-1 rounded-[10px] border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid disabled:bg-inset disabled:text-muted"
        >
          <option value="before">before due</option>
          <option value="after">overdue</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Template
        </label>
        <select
          value={step.templateId}
          disabled={readOnly}
          onChange={(e) => onChange({ templateId: e.target.value })}
          aria-label="Template"
          className="w-full rounded-[10px] border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid disabled:bg-inset disabled:text-muted"
        >
          {templates.length === 0 && <option value="">No templates</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
