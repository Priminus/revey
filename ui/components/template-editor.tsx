'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import {
  renderPreview,
  SAMPLE_VARS,
  useDeleteTemplate,
  useSaveTemplate,
  type FlowScope,
  type Template,
} from '@/lib/api/config';

const VARIABLES: { key: string; label: string }[] = [
  { key: 'debtor_name', label: 'Debtor name' },
  { key: 'outstanding_amount', label: 'Outstanding amount' },
  { key: 'invoice_count', label: 'Invoice count' },
  { key: 'oldest_days_overdue', label: 'Oldest days overdue' },
  { key: 'invoice_list', label: 'Invoice list' },
];

interface TemplateEditorProps {
  template: Template | null;
  onSaved: (template: Template) => void;
  onDeleted: () => void;
}

export function TemplateEditor({ template, onSaved, onDeleted }: TemplateEditorProps): ReactElement {
  const isNew = template === null;
  const [name, setName] = useState(template?.name ?? '');
  const [scope, setScope] = useState<FlowScope>(template?.scope ?? 'global');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const saveMutation = useSaveTemplate();
  const deleteMutation = useDeleteTemplate();

  useEffect(() => {
    setName(template?.name ?? '');
    setScope(template?.scope ?? 'global');
    setSubject(template?.subject ?? '');
    setBody(template?.body ?? '');
  }, [template]);

  const insertVariable = (key: string): void => {
    const textarea = bodyRef.current;
    const token = `{{${key}}}`;
    if (!textarea) {
      setBody((prev) => prev + token);
      return;
    }
    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + token.length;
      textarea.setSelectionRange(caret, caret);
    });
  };

  const handleSave = (): void => {
    saveMutation.mutate(
      { id: template?.id, scope, name, subject, body },
      {
        onSuccess: (saved) => onSaved(saved),
      },
    );
  };

  const handleDelete = (): void => {
    if (!template) return;
    deleteMutation.mutate(template.id, { onSuccess: () => onDeleted() });
  };

  const deleteError = deleteMutation.error as (Error & { status?: number }) | undefined;
  const isConflict =
    !!deleteError && (deleteError.message.includes('409') || /used by a reminder step/i.test(deleteError.message));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            {isNew ? 'New template' : 'Edit template'}
          </h2>
          {!isNew && <Badge tone={template.scope === 'global' ? 'neutral' : 'paid'}>{template.scope}</Badge>}
        </div>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. First reminder"
          className="mt-1.5 mb-3 w-full rounded-[14px] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid"
        />

        {isNew && (
          <>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Scope
            </label>
            <div className="mt-1.5 mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScope('global')}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-200 ${
                  scope === 'global' ? 'bg-paid text-paper' : 'border border-line bg-paper text-muted hover:text-ink'
                }`}
              >
                Global
              </button>
              <button
                type="button"
                onClick={() => setScope('client')}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-200 ${
                  scope === 'client' ? 'bg-paid text-paper' : 'border border-line bg-paper text-muted hover:text-ink'
                }`}
              >
                Client
              </button>
            </div>
          </>
        )}

        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Subject
        </label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Invoice reminder for {{debtor_name}}"
          className="mt-1.5 mb-3 w-full rounded-[14px] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid"
        />

        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Body
          </label>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertVariable(v.key)}
              className="inline-flex items-center rounded-full border border-line bg-inset px-2.5 py-1 font-mono text-[12px] font-medium text-muted transition-colors duration-200 hover:border-paid hover:text-paid"
            >
              {`{{${v.key}}}`}
            </button>
          ))}
        </div>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Hi {{debtor_name}}, you have {{invoice_count}} invoices outstanding…"
          className="w-full rounded-[14px] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid"
        />

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saveMutation.isPending || !name || !subject || !body}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          {!isNew && (
            <Button variant="ghost" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          {saveMutation.error && (
            <span className="text-sm text-danger">{(saveMutation.error as Error).message}</span>
          )}
        </div>
        {deleteError && (
          <p className="mt-3 text-sm text-danger">
            {isConflict
              ? 'This template is used by a reminder step and cannot be deleted.'
              : deleteError.message}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Live preview
        </h2>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Subject</p>
        <p className="mt-1.5 mb-4 text-sm font-medium text-ink">
          {renderPreview(subject, SAMPLE_VARS) || <span className="text-muted">—</span>}
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Body</p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">
          {renderPreview(body, SAMPLE_VARS) || <span className="text-muted">—</span>}
        </p>
      </Card>
    </div>
  );
}
