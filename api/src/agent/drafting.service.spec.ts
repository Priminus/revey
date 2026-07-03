import { DraftingService } from './drafting.service';

describe('DraftingService', () => {
  const prisma = {
    debtor: { findFirst: jest.fn() },
    invoice: { findMany: jest.fn() },
    outreachDraft: { create: jest.fn() },
    emailTemplate: { findFirst: jest.fn() },
  };
  const llm = { completeJson: jest.fn() };
  const flowService = { resolveForClient: jest.fn() };
  const svc = new DraftingService(prisma as never, llm as never, flowService as never);

  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when the debtor is missing', async () => {
    prisma.debtor.findFirst.mockResolvedValue(null);
    await expect(svc.draftForDebtor('c1', 'missing')).rejects.toThrow('Debtor not found');
  });

  it('personalizes the cadence-appropriate template when a flow step resolves', async () => {
    prisma.debtor.findFirst.mockResolvedValue({
      id: 'd1', clientId: 'c1', name: 'Acme', email: 'ar@acme.example',
      scoreValue: 60, recommendedAction: 'firm_followup',
    });
    prisma.invoice.findMany.mockResolvedValue([
      { amountDueCents: 500000, dueDate: new Date('2026-05-01T00:00:00Z'), invoiceNumber: 'INV-1' },
    ]);
    flowService.resolveForClient.mockResolvedValue({
      steps: [{ id: 's1', offsetDays: 14, order: 2, templateId: 't1', templateName: 'Firm' }],
    });
    prisma.emailTemplate.findFirst.mockResolvedValue({
      subject: 'Overdue {{debtor_name}}',
      body: 'You owe {{outstanding_amount}}: {{invoice_list}}',
    });
    llm.completeJson.mockResolvedValue({ subject: 'Overdue Acme', body: 'You owe $5,000: INV-1 ...' });
    prisma.outreachDraft.create.mockResolvedValue({ id: 'draft1' });

    const out = await svc.draftForDebtor('c1', 'd1', new Date('2026-06-01T00:00:00Z'));
    expect(out).toEqual({ id: 'draft1' });

    expect(prisma.emailTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 't1', OR: [{ clientId: null }, { clientId: 'c1' }] },
    });

    const arg = prisma.outreachDraft.create.mock.calls[0][0];
    expect(arg.data.status).toBe('pending');
    expect(arg.data.templateId).toBe('t1');
    expect(arg.data.stepOffsetDays).toBe(14);
    expect(arg.data.subject).toBe('Overdue Acme');
    expect(arg.data.body).toBe('You owe $5,000: INV-1 ...');

    const llmArg = llm.completeJson.mock.calls[0][0];
    expect(llmArg.user).toContain('Acme');
    expect(llmArg.user).not.toContain('{{debtor_name}}');
    expect(llmArg.user).not.toContain('{{outstanding_amount}}');
  });

  it('falls back to writing from scratch when there are no flow steps', async () => {
    prisma.debtor.findFirst.mockResolvedValue({
      id: 'd1', clientId: 'c1', name: 'Acme', email: 'ar@acme.example',
      scoreValue: 60, recommendedAction: 'firm_followup',
    });
    prisma.invoice.findMany.mockResolvedValue([
      { amountDueCents: 500000, dueDate: new Date('2026-05-01T00:00:00Z'), invoiceNumber: 'INV-1' },
    ]);
    flowService.resolveForClient.mockResolvedValue({ steps: [] });
    llm.completeJson.mockResolvedValue({ subject: 'Overdue: INV-1', body: 'Dear Acme…' });
    prisma.outreachDraft.create.mockResolvedValue({ id: 'draft1' });

    const out = await svc.draftForDebtor('c1', 'd1');
    expect(out).toEqual({ id: 'draft1' });

    const arg = prisma.outreachDraft.create.mock.calls[0][0];
    expect(arg.data.status).toBe('pending');
    expect(arg.data.toEmailIntended).toBe('ar@acme.example');
    expect(arg.data.subject).toBe('Overdue: INV-1');
    expect(arg.data.scoreValueAtDraft).toBe(60);
    expect(arg.data.templateId).toBeNull();
    expect(arg.data.stepOffsetDays).toBeNull();

    expect(prisma.emailTemplate.findFirst).not.toHaveBeenCalled();
    const llmArg = llm.completeJson.mock.calls[0][0];
    expect(llmArg.user).toContain('Recommended action: firm_followup');
  });
});
