'use client';

import { useState, type ReactElement } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/button';
import { StepCard, type WorkingStep } from '@/components/step-card';
import { offsetLabel, type FlowStep, type Template } from '@/lib/api/config-format';
import type { SaveStepsInput } from '@/lib/api/config';

export { offsetLabel };

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `new-${Date.now()}-${uidCounter}`;
}

function toWorkingSteps(steps: FlowStep[]): WorkingStep[] {
  return [...steps]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      uid: s.id ?? nextUid(),
      id: s.id,
      offsetDays: s.offsetDays,
      templateId: s.templateId,
    }));
}

interface FlowTimelineProps {
  steps: FlowStep[];
  templates: Template[];
  onSave: (steps: SaveStepsInput[]) => void;
  saving: boolean;
  readOnly?: boolean;
}

export function FlowTimeline({
  steps,
  templates,
  onSave,
  saving,
  readOnly = false,
}: FlowTimelineProps): ReactElement {
  const [prevSteps, setPrevSteps] = useState<FlowStep[]>(steps);
  const [localSteps, setLocalSteps] = useState<WorkingStep[]>(() => toWorkingSteps(steps));

  // Reset local working state whenever the source-of-truth steps prop
  // changes identity (e.g. after a fetch, save, customize, or reset).
  // Adjusting state during render (rather than in an effect) avoids an
  // extra commit; see https://react.dev/learn/you-might-not-need-an-effect.
  if (steps !== prevSteps) {
    setPrevSteps(steps);
    setLocalSteps(toWorkingSteps(steps));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.uid === active.id);
      const newIndex = prev.findIndex((s) => s.uid === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleChange = (uid: string, patch: Partial<Pick<WorkingStep, 'offsetDays' | 'templateId'>>): void => {
    setLocalSteps((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  };

  const handleRemove = (uid: string): void => {
    setLocalSteps((prev) => prev.filter((s) => s.uid !== uid));
  };

  const handleAdd = (): void => {
    const last = localSteps[localSteps.length - 1];
    const offsetDays = last ? last.offsetDays + 7 : 7;
    const templateId = templates[0]?.id ?? '';
    setLocalSteps((prev) => [...prev, { uid: nextUid(), offsetDays, templateId }]);
  };

  const handleSave = (): void => {
    onSave(
      localSteps.map((s, index) => ({
        offsetDays: s.offsetDays,
        templateId: s.templateId,
        order: index,
      })),
    );
  };

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-4">
          <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line bg-paid-tint px-3 py-4 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-paid text-paper">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M7 1v8M3 5l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-paid-deep">
              Due date
            </span>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={localSteps.map((s) => s.uid)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex items-stretch gap-4">
                {localSteps.map((step, index) => (
                  <StepCard
                    key={step.uid}
                    step={step}
                    index={index}
                    templates={templates}
                    readOnly={readOnly}
                    onChange={(patch) => handleChange(step.uid, patch)}
                    onRemove={() => handleRemove(step.uid)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {!readOnly && (
            <button
              type="button"
              onClick={handleAdd}
              className="flex w-40 shrink-0 flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-line text-muted transition-colors duration-200 hover:border-paid hover:text-paid"
            >
              <span className="text-xl leading-none">+</span>
              <span className="text-sm font-medium">Add step</span>
            </button>
          )}
        </div>
      </div>

      {localSteps.length === 0 && (
        <p className="mt-4 text-sm text-muted">No steps yet. Add one to build the flow.</p>
      )}

      {!readOnly && (
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}
