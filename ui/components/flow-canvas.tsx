'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { offsetLabel, type FlowStep, type Template } from '@/lib/api/config-format';
import type { SaveStepsInput } from '@/lib/api/config';

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `new-${Date.now()}-${uidCounter}`;
}

export interface WorkingStep {
  uid: string;
  id?: string;
  offsetDays: number;
  templateId: string;
}

function toWorkingSteps(steps: FlowStep[]): WorkingStep[] {
  return [...steps]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ uid: s.id ?? nextUid(), id: s.id, offsetDays: s.offsetDays, templateId: s.templateId }));
}

const ROW_HEIGHT = 150;
const NODE_X = 40;

function TriggerNode(): ReactElement {
  return (
    <div className="w-[260px] rounded-[14px] border border-paid bg-paid-tint px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paid text-paper"
        >
          ⏱
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-paid-deep">Trigger</p>
          <p className="font-display text-sm font-semibold leading-tight text-ink">
            Invoice becomes overdue
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-paid !bg-paid" />
    </div>
  );
}

interface StepNodeData {
  offsetDays: number;
  templateName: string;
  selected: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onRemove: () => void;
  [key: string]: unknown;
}

function StepNode({ data }: NodeProps): ReactElement {
  const d = data as StepNodeData;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={d.onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') d.onSelect();
      }}
      className={`w-[260px] rounded-[14px] border bg-paper px-4 py-3 transition-colors duration-200 ${
        d.readOnly ? '' : 'cursor-pointer'
      } ${
        d.selected ? 'border-paid shadow-[0_6px_24px_rgba(10,10,10,0.06)]' : 'border-line hover:border-paid'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-line !bg-line" />
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full bg-inset px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          {offsetLabel(d.offsetDays)}
        </span>
        {!d.readOnly && (
          <button
            type="button"
            aria-label="Remove step"
            onClick={(e) => {
              e.stopPropagation();
              d.onRemove();
            }}
            className="text-muted transition-colors duration-200 hover:text-danger"
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base leading-none">
          ✉
        </span>
        <p className="font-display text-sm font-semibold leading-tight text-ink">{d.templateName}</p>
      </div>
      <p className="mt-2 text-[11px] text-muted">✔ approved before send</p>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-line !bg-line" />
    </div>
  );
}

function EndNode(): ReactElement {
  return (
    <div className="w-[260px] rounded-[14px] border border-dashed border-line bg-inset px-4 py-3 text-center">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-line !bg-line" />
      <p className="text-sm font-semibold text-muted">✓ Paid / escalate to human</p>
    </div>
  );
}

const nodeTypes = { trigger: TriggerNode, step: StepNode, end: EndNode };

interface StepInspectorProps {
  step: WorkingStep;
  templates: Template[];
  onChange: (patch: Partial<Pick<WorkingStep, 'offsetDays' | 'templateId'>>) => void;
  onRemove: () => void;
}

function StepInspector({ step, templates, onChange, onRemove }: StepInspectorProps): ReactElement {
  const sign: 'before' | 'after' = step.offsetDays < 0 ? 'before' : 'after';
  const magnitude = Math.abs(step.offsetDays);

  const handleMagnitudeChange = (raw: string): void => {
    const next = Math.max(0, Number.parseInt(raw, 10) || 0);
    onChange({ offsetDays: sign === 'before' ? -next : next });
  };

  const handleSignChange = (nextSign: 'before' | 'after'): void => {
    onChange({ offsetDays: nextSign === 'before' ? -magnitude : magnitude });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Editing step</p>
        <p className="mt-1 font-display text-sm font-semibold text-ink">{offsetLabel(step.offsetDays)}</p>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Timing
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={magnitude}
            onChange={(e) => handleMagnitudeChange(e.target.value)}
            aria-label="Days offset"
            className="w-16 rounded-[10px] border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid"
          />
          <select
            value={sign}
            disabled={magnitude === 0}
            onChange={(e) => handleSignChange(e.target.value as 'before' | 'after')}
            aria-label="Before or after due date"
            className="flex-1 rounded-[10px] border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid disabled:bg-inset disabled:text-muted"
          >
            <option value="before">before due</option>
            <option value="after">overdue</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Template
        </label>
        <select
          value={step.templateId}
          onChange={(e) => onChange({ templateId: e.target.value })}
          aria-label="Template"
          className="w-full rounded-[10px] border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid"
        >
          {templates.length === 0 && <option value="">No templates</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <Button variant="secondary" onClick={onRemove} className="w-full text-danger hover:bg-danger-soft">
        Remove step
      </Button>
    </div>
  );
}

interface FlowCanvasProps {
  steps: FlowStep[];
  templates: Template[];
  onSave: (steps: SaveStepsInput[]) => void;
  saving: boolean;
  readOnly?: boolean;
}

function toSaveShape(ws: WorkingStep[]): SaveStepsInput[] {
  return [...ws]
    .sort((a, b) => a.offsetDays - b.offsetDays)
    .map((s, index) => ({ offsetDays: s.offsetDays, templateId: s.templateId, order: index }));
}

function stepsEqual(a: SaveStepsInput[], b: SaveStepsInput[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.offsetDays === b[i].offsetDays && x.templateId === b[i].templateId);
}

/**
 * Count of added/removed/edited steps for the "N unsaved changes" indicator.
 * Matches by persisted `id` (stable across edits/reorders) rather than array
 * position, so e.g. removing one step reports 1 change, not a cascade of
 * positional shifts for every step after it.
 */
function countChanges(baselineSteps: WorkingStep[], currentSteps: WorkingStep[]): number {
  const baseById = new Map(baselineSteps.filter((s) => s.id).map((s) => [s.id as string, s]));
  const currentIds = new Set(currentSteps.filter((s) => s.id).map((s) => s.id as string));
  let count = 0;
  for (const id of baseById.keys()) {
    if (!currentIds.has(id)) count += 1; // removed
  }
  for (const s of currentSteps) {
    if (!s.id) {
      count += 1; // newly added (no persisted id yet)
      continue;
    }
    const base = baseById.get(s.id);
    if (base && (base.offsetDays !== s.offsetDays || base.templateId !== s.templateId)) {
      count += 1; // edited
    }
  }
  return count;
}

export function FlowCanvas({
  steps,
  templates,
  onSave,
  saving,
  readOnly = false,
}: FlowCanvasProps): ReactElement {
  const [prevSteps, setPrevSteps] = useState<FlowStep[]>(steps);
  // History stack of working-step snapshots, enabling undo/redo. The current
  // working state is always `history[historyIndex]`.
  const [history, setHistory] = useState<WorkingStep[][]>(() => [toWorkingSteps(steps)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  // The last-saved baseline (working-step shape, keeps stable ids), used to
  // compute the dirty state and the change count.
  const [baselineSteps, setBaselineSteps] = useState<WorkingStep[]>(() => toWorkingSteps(steps));
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const pendingSaveRef = useRef(false);

  const localSteps = history[historyIndex];

  // Reset local working state + history whenever the source-of-truth steps
  // prop actually changes identity (e.g. after a fetch, save, customize,
  // reset, or scope switch) — never on every render.
  if (steps !== prevSteps) {
    setPrevSteps(steps);
    const ws = toWorkingSteps(steps);
    setHistory([ws]);
    setHistoryIndex(0);
    setBaselineSteps(ws);
    setSelectedUid(null);
    if (pendingSaveRef.current) {
      pendingSaveRef.current = false;
      setSavedFlash(true);
    }
  }

  // Safety net: if a save never resolves into a new `steps` prop (e.g. the
  // mutation failed), drop the pending flag so a later, unrelated prop
  // change doesn't get mistaken for a successful save.
  useEffect(() => {
    if (saving || !pendingSaveRef.current) return;
    const t = setTimeout(() => {
      pendingSaveRef.current = false;
    }, 4000);
    return () => clearTimeout(t);
  }, [saving]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2000);
    return () => clearTimeout(t);
  }, [savedFlash]);

  const sorted = useMemo(() => [...localSteps].sort((a, b) => a.offsetDays - b.offsetDays), [localSteps]);

  const saveShape = useMemo(() => toSaveShape(localSteps), [localSteps]);
  const baselineShape = useMemo(() => toSaveShape(baselineSteps), [baselineSteps]);
  const dirty = useMemo(() => !stepsEqual(saveShape, baselineShape), [saveShape, baselineShape]);
  const changeCount = useMemo(
    () => countChanges(baselineSteps, localSteps),
    [baselineSteps, localSteps],
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Push a new snapshot onto the history stack, discarding any redo tail.
  const commit = (next: WorkingStep[]): void => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
    setHistoryIndex((i) => i + 1);
  };

  const handleChange = (
    uid: string,
    patch: Partial<Pick<WorkingStep, 'offsetDays' | 'templateId'>>,
  ): void => {
    commit(localSteps.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  };

  const handleRemove = (uid: string): void => {
    commit(localSteps.filter((s) => s.uid !== uid));
    setSelectedUid((cur) => (cur === uid ? null : cur));
  };

  const handleAdd = (): void => {
    const maxOffset = localSteps.reduce((max, s) => Math.max(max, s.offsetDays), 0);
    const offsetDays = localSteps.length ? maxOffset + 7 : 7;
    const templateId = templates[0]?.id ?? '';
    const uid = nextUid();
    commit([...localSteps, { uid, offsetDays, templateId }]);
    setSelectedUid(uid);
  };

  const handleUndo = (): void => {
    if (!canUndo) return;
    setHistoryIndex((i) => i - 1);
    setSelectedUid(null);
  };

  const handleRedo = (): void => {
    if (!canRedo) return;
    setHistoryIndex((i) => i + 1);
    setSelectedUid(null);
  };

  const handleSave = (): void => {
    if (!dirty || saving) return;
    pendingSaveRef.current = true;
    setSavedFlash(false);
    onSave(sorted.map((s, index) => ({ offsetDays: s.offsetDays, templateId: s.templateId, order: index })));
  };

  const { nodes, edges } = useMemo(() => {
    const ns: Node[] = [
      {
        id: 'trigger',
        type: 'trigger',
        position: { x: NODE_X, y: 0 },
        data: {},
        draggable: false,
        selectable: false,
      },
    ];

    sorted.forEach((step, i) => {
      const template = templates.find((t) => t.id === step.templateId);
      ns.push({
        id: step.uid,
        type: 'step',
        position: { x: NODE_X, y: (i + 1) * ROW_HEIGHT },
        data: {
          offsetDays: step.offsetDays,
          templateName: template?.name ?? 'No template',
          selected: selectedUid === step.uid,
          readOnly,
          onSelect: () => !readOnly && setSelectedUid(step.uid),
          onRemove: () => handleRemove(step.uid),
        },
        draggable: false,
        selectable: !readOnly,
      });
    });

    ns.push({
      id: 'end',
      type: 'end',
      position: { x: NODE_X, y: (sorted.length + 1) * ROW_HEIGHT },
      data: {},
      draggable: false,
      selectable: false,
    });

    const chain = ['trigger', ...sorted.map((s) => s.uid), 'end'];
    const es: Edge[] = [];
    for (let i = 0; i < chain.length - 1; i += 1) {
      es.push({
        id: `${chain[i]}-${chain[i + 1]}`,
        source: chain[i],
        target: chain[i + 1],
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#e7e7e5' },
        style: { stroke: '#e7e7e5', strokeWidth: 1.5 },
      });
    }

    return { nodes: ns, edges: es };
  }, [sorted, templates, selectedUid, readOnly]);

  const selectedStep = localSteps.find((s) => s.uid === selectedUid) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="h-[600px] flex-1 overflow-hidden rounded-[14px] border border-line bg-inset/40">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={!readOnly}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e7e7e5" gap={22} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {!readOnly && (
          <div className="w-full shrink-0 lg:w-72">
            <Card>
              {selectedStep ? (
                <StepInspector
                  step={selectedStep}
                  templates={templates}
                  onChange={(patch) => handleChange(selectedStep.uid, patch)}
                  onRemove={() => handleRemove(selectedStep.uid)}
                />
              ) : (
                <p className="text-sm text-muted">Select a step in the canvas to edit it.</p>
              )}
            </Card>
          </div>
        )}
      </div>

      {!readOnly && (
        <div
          role="toolbar"
          aria-label="Workflow editor actions"
          className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-paper px-4 py-3 shadow-[0_-4px_16px_rgba(10,10,10,0.04)]"
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo"
            >
              ↶ Undo
            </Button>
            <Button
              variant="ghost"
              onClick={handleRedo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo"
            >
              ↷ Redo
            </Button>
            <Button variant="secondary" onClick={handleAdd}>
              + Add step
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {savedFlash ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-paid-deep">
                ✓ Saved
              </span>
            ) : dirty ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-overdue-ink">
                {changeCount} unsaved change{changeCount === 1 ? '' : 's'}
              </span>
            ) : null}
            <Button onClick={handleSave} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
