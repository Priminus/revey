import { DraftingService } from './drafting.service';

describe('DraftingService', () => {
  const prisma = {
    debtor: { findFirst: jest.fn() },
    invoice: { findMany: jest.fn() },
    outreachDraft: { create: jest.fn() },
  };
  const llm = { completeJson: jest.fn() };
  const svc = new DraftingService(prisma as never, llm as never);

  afterEach(() => jest.clearAllMocks());

  it('drafts an email and persists a pending outreach draft', async () => {
    prisma.debtor.findFirst.mockResolvedValue({
      id: 'd1', clientId: 'c1', name: 'Acme', email: 'ar@acme.example',
      scoreValue: 60, recommendedAction: 'firm_followup',
    });
    prisma.invoice.findMany.mockResolvedValue([
      { amountDueCents: 500000, dueDate: new Date('2026-05-01T00:00:00Z'), invoiceNumber: 'INV-1' },
    ]);
    llm.completeJson.mockResolvedValue({ subject: 'Overdue: INV-1', body: 'Dear Acme…' });
    prisma.outreachDraft.create.mockResolvedValue({ id: 'draft1' });

    const out = await svc.draftForDebtor('c1', 'd1');
    expect(out).toEqual({ id: 'draft1' });
    const arg = prisma.outreachDraft.create.mock.calls[0][0];
    expect(arg.data.status).toBe('pending');
    expect(arg.data.toEmailIntended).toBe('ar@acme.example');
    expect(arg.data.subject).toBe('Overdue: INV-1');
    expect(arg.data.scoreValueAtDraft).toBe(60);
  });
});
