'use client';

import { useState, type ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { AppShell } from '@/components/app-shell';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TemplateEditor } from '@/components/template-editor';
import { useTemplates, type Template } from '@/lib/api/config';

function scopeTone(scope: Template['scope']): BadgeTone {
  return scope === 'global' ? 'neutral' : 'paid';
}

function TemplateList({
  templates,
  selectedId,
  onSelect,
  onNew,
}: {
  templates: Template[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}): ReactElement {
  return (
    <Card className="flex flex-col gap-2">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          All templates
        </h2>
        <Button variant="secondary" onClick={onNew}>
          New template
        </Button>
      </div>

      {templates.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">No templates yet.</p>
      )}

      <ul className="flex flex-col gap-1.5">
        {templates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onSelect(template.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-[14px] border px-3 py-2.5 text-left transition-colors duration-200 ${
                selectedId === template.id
                  ? 'border-paid bg-paid-tint'
                  : 'border-line bg-paper hover:bg-inset'
              }`}
            >
              <span className="truncate text-sm font-medium text-ink">{template.name}</span>
              <Badge tone={scopeTone(template.scope)} className="shrink-0">
                {template.scope}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TemplatesContent(): ReactElement {
  const { data: templates, isLoading } = useTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const list = templates ?? [];
  const selected = creatingNew ? null : (list.find((t) => t.id === selectedId) ?? null);

  const handleSelect = (id: string): void => {
    setCreatingNew(false);
    setSelectedId(id);
  };

  const handleNew = (): void => {
    setCreatingNew(true);
    setSelectedId(null);
  };

  const handleSaved = (template: Template): void => {
    setCreatingNew(false);
    setSelectedId(template.id);
  };

  const handleDeleted = (): void => {
    setCreatingNew(false);
    setSelectedId(null);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      {isLoading ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted">Loading templates…</p>
        </Card>
      ) : (
        <TemplateList
          templates={list}
          selectedId={creatingNew ? null : selectedId}
          onSelect={handleSelect}
          onNew={handleNew}
        />
      )}

      {creatingNew || selected ? (
        <TemplateEditor template={selected} onSaved={handleSaved} onDeleted={handleDeleted} />
      ) : (
        <Card>
          <p className="py-8 text-center text-sm text-muted">
            Select a template to edit, or create a new one.
          </p>
        </Card>
      )}
    </div>
  );
}

export default function TemplatesPage(): ReactElement {
  return (
    <>
      <SignedIn>
        <AppShell>
          <h1 className="mb-1 text-[1.75rem] font-semibold">Templates</h1>
          <p className="mb-6 text-sm text-muted">
            Reusable email templates for reminder steps, with live preview against sample data.
          </p>
          <TemplatesContent />
        </AppShell>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
