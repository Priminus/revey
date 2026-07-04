'use client';

import { useMemo, useState, type ReactElement } from 'react';
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

export function FlowCanvas({
  steps,
  templates,
  onSave,
  saving,
  readOnly = false,
}: FlowCanvasProps): ReactElement {
  const [prevSteps, setPrevSteps] = useState<FlowStep[]>(steps);
  const [localSteps, setLocalSteps] = useState<WorkingStep[]>(() => toWorkingSteps(steps));
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // Reset local working state whenever the source-of-truth steps prop
  // changes identity (e.g. after a fetch, save, customize, or reset).
  if (steps !== prevSteps) {
    setPrevSteps(steps);
    setLocalSteps(toWorkingSteps(steps));
    setSelectedUid(null);
  }

  const sorted = useMemo(() => [...localSteps].sort((a, b) => a.offsetDays - b.offsetDays), [localSteps]);

  const handleChange = (
    uid: string,
    patch: Partial<Pick<WorkingStep, 'offsetDays' | 'templateId'>>,
  ): void => {
    setLocalSteps((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  };

  const handleRemove = (uid: string): void => {
    setLocalSteps((prev) => prev.filter((s) => s.uid !== uid));
    setSelectedUid((cur) => (cur === uid ? null : cur));
  };

  const handleAdd = (): void => {
    const maxOffset = localSteps.reduce((max, s) => Math.max(max, s.offsetDays), 0);
    const offsetDays = localSteps.length ? maxOffset + 7 : 7;
    const templateId = templates[0]?.id ?? '';
    const uid = nextUid();
    setLocalSteps((prev) => [...prev, { uid, offsetDays, templateId }]);
    setSelectedUid(uid);
  };

  const handleSave = (): void => {
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
        <div className="w-full shrink-0 space-y-4 lg:w-72">
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
          <Button variant="secondary" onClick={handleAdd} className="w-full">
            + Add step
          </Button>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}
