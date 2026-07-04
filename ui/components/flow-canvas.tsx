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
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import {
  nodeTypeLabel,
  offsetLabel,
  type FlowStep,
  type NodeType,
  type SaveStepsInput,
  type Template,
} from '@/lib/api/config-format';

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `new-${Date.now()}-${uidCounter}`;
}

// ---------------------------------------------------------------------------
// Config field helpers — config is an untyped bag per node type. These read
// values back with sensible fallbacks so the UI never renders `undefined`.
// ---------------------------------------------------------------------------

type ConditionField = 'days_overdue' | 'amount_due' | 'score';
type ConditionOp = 'gte' | 'lte' | 'gt' | 'lt';

const CONDITION_FIELDS: { value: ConditionField; label: string }[] = [
  { value: 'days_overdue', label: 'Days overdue' },
  { value: 'amount_due', label: 'Amount due' },
  { value: 'score', label: 'Willingness score' },
];

const CONDITION_OPS: { value: ConditionOp; label: string; symbol: string }[] = [
  { value: 'gte', label: '≥ (at least)', symbol: '≥' },
  { value: 'lte', label: '≤ (at most)', symbol: '≤' },
  { value: 'gt', label: '> (more than)', symbol: '>' },
  { value: 'lt', label: '< (less than)', symbol: '<' },
];

function readNumber(config: Record<string, unknown> | null, key: string, fallback: number): number {
  const v = config?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readString(config: Record<string, unknown> | null, key: string, fallback: string): string {
  const v = config?.[key];
  return typeof v === 'string' ? v : fallback;
}

function waitDays(config: Record<string, unknown> | null): number {
  return readNumber(config, 'days', 7);
}

function conditionField(config: Record<string, unknown> | null): ConditionField {
  const v = readString(config, 'field', 'days_overdue');
  return (CONDITION_FIELDS.some((f) => f.value === v) ? v : 'days_overdue') as ConditionField;
}

function conditionOp(config: Record<string, unknown> | null): ConditionOp {
  const v = readString(config, 'op', 'gte');
  return (CONDITION_OPS.some((o) => o.value === v) ? v : 'gte') as ConditionOp;
}

function conditionValue(config: Record<string, unknown> | null): number {
  return readNumber(config, 'value', 30);
}

function escalateNote(config: Record<string, unknown> | null): string {
  return readString(config, 'note', '');
}

const NODE_ICON: Record<NodeType, string> = {
  reminder: '✉',
  wait: '⏱',
  condition: '⇄',
  escalate: '⚑',
};

function summaryLine(step: WorkingStep, templates: Template[]): string {
  switch (step.type) {
    case 'reminder': {
      const template = templates.find((t) => t.id === step.templateId);
      return `${offsetLabel(step.offsetDays)} · ${template?.name ?? 'No template'}`;
    }
    case 'wait':
      return `Wait ${waitDays(step.config)} days`;
    case 'condition': {
      const field = CONDITION_FIELDS.find((f) => f.value === conditionField(step.config));
      const op = CONDITION_OPS.find((o) => o.value === conditionOp(step.config));
      return `If ${field?.label.toLowerCase() ?? 'days overdue'} ${op?.symbol ?? '≥'} ${conditionValue(step.config)}`;
    }
    case 'escalate':
      return 'Escalate to human';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Working state — one entry per step. `y` is the canvas Y position; step ORDER
// is derived by sorting on `y` (top-to-bottom), not on offsetDays.
// ---------------------------------------------------------------------------

export interface WorkingStep {
  uid: string;
  id?: string;
  type: NodeType;
  offsetDays: number;
  templateId: string | null;
  requireApproval: boolean;
  config: Record<string, unknown> | null;
  y: number;
}

const ROW_HEIGHT = 150;
const NODE_X = 40;
const FIRST_STEP_Y = ROW_HEIGHT;

function toWorkingSteps(steps: FlowStep[]): WorkingStep[] {
  return [...steps]
    .sort((a, b) => a.order - b.order)
    .map((s, index) => ({
      uid: s.id ?? nextUid(),
      id: s.id,
      type: s.type,
      offsetDays: s.offsetDays,
      templateId: s.templateId,
      requireApproval: s.requireApproval,
      config: s.config,
      y: FIRST_STEP_Y + index * ROW_HEIGHT,
    }));
}

function sortByY(ws: WorkingStep[]): WorkingStep[] {
  return [...ws].sort((a, b) => a.y - b.y);
}

function toSaveShape(ws: WorkingStep[]): SaveStepsInput[] {
  return sortByY(ws).map((s, index) => {
    const isReminder = s.type === 'reminder';
    return {
      offsetDays: isReminder ? s.offsetDays : 0,
      templateId: isReminder ? s.templateId : null,
      order: index,
      requireApproval: isReminder ? s.requireApproval : false,
      type: s.type,
      config: isReminder ? null : s.config,
    };
  });
}

function stepsEqual(a: SaveStepsInput[], b: SaveStepsInput[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Content signature (excludes position/order) for change detection. */
function contentSig(s: WorkingStep): string {
  return JSON.stringify({
    type: s.type,
    offsetDays: s.offsetDays,
    templateId: s.templateId,
    requireApproval: s.requireApproval,
    config: s.config,
  });
}

/**
 * Count of added/removed/edited steps for the "N unsaved changes" indicator.
 * Matches by persisted `id` (stable across edits/reorders) rather than array
 * position, so removing one step reports 1 change, not a cascade.
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
    if (base && contentSig(base) !== contentSig(s)) count += 1; // edited
  }
  return count;
}

// ---------------------------------------------------------------------------
// Node visuals
// ---------------------------------------------------------------------------

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
  type: NodeType;
  typeLabel: string;
  icon: string;
  summary: string;
  showApproval: boolean;
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-inset px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          <span aria-hidden>{d.icon}</span>
          {d.typeLabel}
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
      <p className="font-display text-sm font-semibold leading-tight text-ink">{d.summary}</p>
      {d.showApproval && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-paid-soft px-2 py-0.5 text-[11px] font-semibold text-paid-deep">
          ✔ needs approval
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-line !bg-line" />
    </div>
  );
}

function EndNode(): ReactElement {
  return (
    <div className="w-[260px] rounded-[14px] border border-dashed border-line bg-inset px-4 py-3 text-center">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-line !bg-line" />
      <p className="text-sm font-semibold text-muted">✓ Paid / resolved</p>
    </div>
  );
}

const nodeTypes = { trigger: TriggerNode, step: StepNode, end: EndNode };

// ---------------------------------------------------------------------------
// Inspector — typed fields per node type
// ---------------------------------------------------------------------------

const FIELD_LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted';
const INPUT_CLASS =
  'w-full rounded-[10px] border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid';

interface StepInspectorProps {
  step: WorkingStep;
  templates: Template[];
  onChange: (patch: Partial<WorkingStep>) => void;
  onRemove: () => void;
}

function ReminderFields({ step, templates, onChange }: Omit<StepInspectorProps, 'onRemove'>): ReactElement {
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
    <>
      <div>
        <label className={FIELD_LABEL}>Timing</label>
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
        <label className={FIELD_LABEL}>Template</label>
        <select
          value={step.templateId ?? ''}
          onChange={(e) => onChange({ templateId: e.target.value })}
          aria-label="Template"
          className={INPUT_CLASS}
        >
          {templates.length === 0 && <option value="">No templates</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={step.requireApproval}
          aria-label="Requires approval before sending"
          onClick={() => onChange({ requireApproval: !step.requireApproval })}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ease-[cubic-bezier(.22,.61,.36,1)] ${
            step.requireApproval ? 'border-paid bg-paid-tint' : 'border-line bg-inset'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full transition-transform duration-200 ease-[cubic-bezier(.22,.61,.36,1)] ${
              step.requireApproval ? 'translate-x-6 bg-paid' : 'translate-x-1 bg-muted'
            }`}
          />
        </button>
        <span className="text-sm text-ink">Requires approval before sending</span>
      </label>
    </>
  );
}

function WaitFields({ step, onChange }: Pick<StepInspectorProps, 'step' | 'onChange'>): ReactElement {
  return (
    <div>
      <label className={FIELD_LABEL}>Wait days</label>
      <input
        type="number"
        min={0}
        value={waitDays(step.config)}
        onChange={(e) => onChange({ config: { days: Math.max(0, Number.parseInt(e.target.value, 10) || 0) } })}
        aria-label="Wait days"
        className={INPUT_CLASS}
      />
    </div>
  );
}

function ConditionFields({ step, onChange }: Pick<StepInspectorProps, 'step' | 'onChange'>): ReactElement {
  const field = conditionField(step.config);
  const op = conditionOp(step.config);
  const value = conditionValue(step.config);
  const patch = (next: Partial<{ field: ConditionField; op: ConditionOp; value: number }>): void => {
    onChange({ config: { field, op, value, ...next } });
  };

  return (
    <>
      <div>
        <label className={FIELD_LABEL}>Field</label>
        <select
          value={field}
          onChange={(e) => patch({ field: e.target.value as ConditionField })}
          aria-label="Condition field"
          className={INPUT_CLASS}
        >
          {CONDITION_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={FIELD_LABEL}>Operator</label>
        <select
          value={op}
          onChange={(e) => patch({ op: e.target.value as ConditionOp })}
          aria-label="Condition operator"
          className={INPUT_CLASS}
        >
          {CONDITION_OPS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={FIELD_LABEL}>Value</label>
        <input
          type="number"
          value={value}
          onChange={(e) => patch({ value: Number.parseInt(e.target.value, 10) || 0 })}
          aria-label="Condition value"
          className={INPUT_CLASS}
        />
      </div>
    </>
  );
}

function EscalateFields({ step, onChange }: Pick<StepInspectorProps, 'step' | 'onChange'>): ReactElement {
  return (
    <div>
      <label className={FIELD_LABEL}>Note</label>
      <textarea
        value={escalateNote(step.config)}
        onChange={(e) => onChange({ config: { note: e.target.value } })}
        aria-label="Escalation note"
        rows={3}
        className={`${INPUT_CLASS} resize-none`}
        placeholder="Hand off to a human with context…"
      />
    </div>
  );
}

function StepInspector({ step, templates, onChange, onRemove }: StepInspectorProps): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Editing {nodeTypeLabel(step.type).toLowerCase()}
        </p>
        <p className="mt-1 flex items-center gap-1.5 font-display text-sm font-semibold text-ink">
          <span aria-hidden>{NODE_ICON[step.type]}</span>
          {nodeTypeLabel(step.type)}
        </p>
      </div>

      {step.type === 'reminder' && (
        <ReminderFields step={step} templates={templates} onChange={onChange} />
      )}
      {step.type === 'wait' && <WaitFields step={step} onChange={onChange} />}
      {step.type === 'condition' && <ConditionFields step={step} onChange={onChange} />}
      {step.type === 'escalate' && <EscalateFields step={step} onChange={onChange} />}

      <Button variant="secondary" onClick={onRemove} className="w-full text-danger hover:bg-danger-soft">
        Remove node
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-node palette
// ---------------------------------------------------------------------------

const PALETTE: { type: NodeType; label: string; icon: string }[] = [
  { type: 'reminder', label: 'Reminder', icon: '✉' },
  { type: 'wait', label: 'Wait', icon: '⏱' },
  { type: 'condition', label: 'Condition', icon: '⇄' },
  { type: 'escalate', label: 'Escalate', icon: '⚑' },
];

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

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
  const [history, setHistory] = useState<WorkingStep[][]>(() => [toWorkingSteps(steps)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [baselineSteps, setBaselineSteps] = useState<WorkingStep[]>(() => toWorkingSteps(steps));
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const pendingSaveRef = useRef(false);

  const localSteps = history[historyIndex];

  // Reset local working state whenever the source-of-truth steps prop changes
  // identity (fetch, save, customize, reset, scope switch) — never per render.
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

  const ordered = useMemo(() => sortByY(localSteps), [localSteps]);

  const saveShape = useMemo(() => toSaveShape(localSteps), [localSteps]);
  const baselineShape = useMemo(() => toSaveShape(baselineSteps), [baselineSteps]);
  const dirty = useMemo(() => !stepsEqual(saveShape, baselineShape), [saveShape, baselineShape]);
  const changeCount = useMemo(
    () => countChanges(baselineSteps, localSteps),
    [baselineSteps, localSteps],
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const commit = (next: WorkingStep[]): void => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
    setHistoryIndex((i) => i + 1);
  };

  const handleChange = (uid: string, patch: Partial<WorkingStep>): void => {
    commit(localSteps.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  };

  const handleRemove = (uid: string): void => {
    commit(localSteps.filter((s) => s.uid !== uid));
    setSelectedUid((cur) => (cur === uid ? null : cur));
  };

  const handleAdd = (type: NodeType): void => {
    const maxY = localSteps.reduce((m, s) => Math.max(m, s.y), 0);
    const y = localSteps.length ? maxY + ROW_HEIGHT : FIRST_STEP_Y;
    const uid = nextUid();

    let step: WorkingStep;
    if (type === 'reminder') {
      const maxOffset = localSteps
        .filter((s) => s.type === 'reminder')
        .reduce((m, s) => Math.max(m, s.offsetDays), 0);
      step = {
        uid,
        type,
        offsetDays: maxOffset ? maxOffset + 7 : 7,
        templateId: templates[0]?.id ?? null,
        requireApproval: true,
        config: null,
        y,
      };
    } else if (type === 'wait') {
      step = { uid, type, offsetDays: 0, templateId: null, requireApproval: false, config: { days: 7 }, y };
    } else if (type === 'condition') {
      step = {
        uid,
        type,
        offsetDays: 0,
        templateId: null,
        requireApproval: false,
        config: { field: 'days_overdue', op: 'gte', value: 30 },
        y,
      };
    } else {
      step = { uid, type, offsetDays: 0, templateId: null, requireApproval: false, config: { note: '' }, y };
    }

    commit([...localSteps, step]);
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

  // Persist the dropped Y position into working state so the derived order
  // (top-to-bottom by Y) reflects the new arrangement.
  const handleNodesChange = (changes: NodeChange[]): void => {
    if (readOnly) return;
    let moved = false;
    const nextY = new Map<string, number>();
    for (const c of changes) {
      if (c.type === 'position' && c.dragging === false && c.position) {
        nextY.set(c.id, c.position.y);
        moved = true;
      }
    }
    if (!moved) return;
    commit(localSteps.map((s) => (nextY.has(s.uid) ? { ...s, y: nextY.get(s.uid) as number } : s)));
  };

  const handleSave = (): void => {
    if (!dirty || saving) return;
    pendingSaveRef.current = true;
    setSavedFlash(false);
    onSave(toSaveShape(localSteps));
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

    localSteps.forEach((step) => {
      ns.push({
        id: step.uid,
        type: 'step',
        position: { x: NODE_X, y: step.y },
        data: {
          type: step.type,
          typeLabel: nodeTypeLabel(step.type),
          icon: NODE_ICON[step.type],
          summary: summaryLine(step, templates),
          showApproval: step.type === 'reminder' && step.requireApproval,
          selected: selectedUid === step.uid,
          readOnly,
          onSelect: () => !readOnly && setSelectedUid(step.uid),
          onRemove: () => handleRemove(step.uid),
        },
        draggable: !readOnly,
        selectable: !readOnly,
      });
    });

    const maxY = localSteps.reduce((m, s) => Math.max(m, s.y), 0);
    ns.push({
      id: 'end',
      type: 'end',
      position: { x: NODE_X, y: localSteps.length ? maxY + ROW_HEIGHT : FIRST_STEP_Y },
      data: {},
      draggable: false,
      selectable: false,
    });

    const chain = ['trigger', ...ordered.map((s) => s.uid), 'end'];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSteps, ordered, templates, selectedUid, readOnly]);

  const selectedStep = localSteps.find((s) => s.uid === selectedUid) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <div
          role="toolbar"
          aria-label="Add workflow node"
          className="flex flex-wrap items-center gap-2 rounded-[14px] border border-line bg-paper px-3 py-2.5"
        >
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Add node
          </span>
          {PALETTE.map((p) => (
            <Button key={p.type} variant="secondary" onClick={() => handleAdd(p.type)}>
              <span aria-hidden>{p.icon}</span> + {p.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="h-[600px] flex-1 overflow-hidden rounded-[14px] border border-line bg-inset/40">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              nodesDraggable={!readOnly}
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
                <p className="text-sm text-muted">
                  Add a node above, or select one in the canvas to edit it. Drag nodes to reorder.
                </p>
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
            <Button variant="ghost" onClick={handleUndo} disabled={!canUndo} aria-label="Undo" title="Undo">
              ↶ Undo
            </Button>
            <Button variant="ghost" onClick={handleRedo} disabled={!canRedo} aria-label="Redo" title="Redo">
              ↷ Redo
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
