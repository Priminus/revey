'use client';

import Link from 'next/link';
import { useState, type ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
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
        <div className="min-h-screen bg-paper text-ink">
          <header className="border-b border-line bg-paper">
            <div className="mx-auto flex max-w-(--maxw) items-center justify-between px-6 py-4">
              <div className="flex items-center gap-8">
                <span className="font-display text-lg font-semibold tracking-[-0.01em]">Revey</span>
                <nav className="flex items-center gap-5 text-sm font-medium text-muted">
                  <Link href="/" className="transition-colors duration-200 hover:text-ink">
                    Dashboard
                  </Link>
                  <Link href="/connections" className="transition-colors duration-200 hover:text-ink">
                    Connections
                  </Link>
                  <Link href="/approvals" className="transition-colors duration-200 hover:text-ink">
                    Approvals
                  </Link>
                  <Link href="/templates" className="text-ink">
                    Templates
                  </Link>
                  <Link href="/workflow" className="transition-colors duration-200 hover:text-ink">
                    Workflow
                  </Link>
                </nav>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-(--maxw) px-6 py-8">
            <h1 className="mb-1 text-[1.75rem] font-semibold">Templates</h1>
            <p className="mb-6 text-sm text-muted">
              Reusable email templates for reminder steps, with live preview against sample data.
            </p>
            <TemplatesContent />
          </main>
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
