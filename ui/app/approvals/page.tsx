'use client';

import Link from 'next/link';
import { useState, type ReactElement } from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import {
  useDrafts,
  useEditDraft,
  useApproveDraft,
  useRejectDraft,
  type DraftRow,
} from '@/lib/api/ar';

function DraftCard({ draft }: { draft: DraftRow }): ReactElement {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const editMutation = useEditDraft();
  const approveMutation = useApproveDraft();
  const rejectMutation = useRejectDraft();

  const busy = approveMutation.isPending || rejectMutation.isPending;
  const isFailed = draft.status === 'failed';

  const saveSubject = (): void => {
    if (subject !== draft.subject) editMutation.mutate({ id: draft.id, subject });
  };
  const saveBody = (): void => {
    if (body !== draft.body) editMutation.mutate({ id: draft.id, body });
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/debtors/${draft.debtorId}`}
            className="font-display text-lg font-semibold text-ink transition-colors duration-200 hover:text-paid"
          >
            {draft.debtorName}
          </Link>
          <p className="mt-1 text-sm text-muted">
            To: {draft.toEmailIntended ?? 'no email on file'}
          </p>
          {draft.redirectTo && (
            <p className="mt-0.5 text-xs text-info">
              → redirected to {draft.redirectTo} in test mode
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isFailed && (
            <Badge tone="danger" className="shrink-0">
              Failed
            </Badge>
          )}
          {draft.scoreValueAtDraft !== null && (
            <Badge tone="neutral" className="shrink-0">
              Score {draft.scoreValueAtDraft} at draft
            </Badge>
          )}
        </div>
      </div>

      {isFailed && draft.error && (
        <p className="mb-3 rounded-[10px] border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          {draft.error}
        </p>
      )}

      <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Subject
      </label>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        onBlur={saveSubject}
        className="mt-1.5 mb-3 w-full rounded-[14px] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid"
      />

      <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Body
      </label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={saveBody}
        rows={6}
        className="mt-1.5 w-full rounded-[14px] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-paid"
      />

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => approveMutation.mutate(draft.id)} disabled={busy}>
          {approveMutation.isPending ? 'Sending…' : isFailed ? 'Retry & Send' : 'Approve & Send'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => rejectMutation.mutate(draft.id)}
          disabled={busy}
        >
          {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
        </Button>
        {editMutation.isPending && <span className="text-xs text-muted">Saving…</span>}
      </div>

      {approveMutation.data?.status === 'sent' && (
        <p className="mt-3 text-sm text-paid">Sent successfully.</p>
      )}
      {approveMutation.data?.status === 'failed' && (
        <p className="mt-3 text-sm text-danger">
          Failed to send{approveMutation.data.error ? `: ${approveMutation.data.error}` : '.'}
        </p>
      )}
      {approveMutation.error && (
        <p className="mt-3 text-sm text-danger">{(approveMutation.error as Error).message}</p>
      )}
      {rejectMutation.error && (
        <p className="mt-3 text-sm text-danger">{(rejectMutation.error as Error).message}</p>
      )}
    </Card>
  );
}

function DraftsList(): ReactElement {
  const { data: drafts, isLoading } = useDrafts();

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted">Loading drafts…</p>;
  }

  if (!drafts || drafts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No drafts awaiting approval.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} />
      ))}
    </div>
  );
}

export default function ApprovalsPage(): ReactElement {
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
                  <Link href="/approvals" className="text-ink">
                    Approvals
                  </Link>
                </nav>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-(--maxw) px-6 py-8">
            <h1 className="mb-1 text-[1.75rem] font-semibold">Approvals</h1>
            <p className="mb-6 text-sm text-muted">
              Review and send AI-drafted outreach. Nothing goes out without your approval.
            </p>
            <DraftsList />
          </main>
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
