import { ScoringService } from './scoring.service';

describe('ScoringService', () => {
  const asOf = new Date('2026-07-02T00:00:00Z');
  const prisma = {
    debtor: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    debtorInteraction: { findMany: jest.fn() },
  };
  const llm = { completeJson: jest.fn() };
  const svc = new ScoringService(prisma as never, llm as never);

  afterEach(() => jest.clearAllMocks());

  it('scores a debtor and persists the result', async () => {
    prisma.debtor.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', name: 'Acme' });
    prisma.invoice.findMany.mockResolvedValue([
      { amountDueCents: 500000, dueDate: new Date('2026-05-01T00:00:00Z'), invoiceNumber: 'INV-1' },
    ]);
    prisma.debtorInteraction.findMany.mockResolvedValue([]);
    llm.completeJson.mockResolvedValue({
      scoreValue: 72,
      scoreBand: 'uncertain',
      recommendedAction: 'firm_followup',
      rationale: 'Consistently 30-60 days late.',
    });

    const result = await svc.scoreDebtor('c1', 'd1', asOf);
    expect(result.scoreValue).toBe(72);
    expect(llm.completeJson).toHaveBeenCalled();
    const update = prisma.debtor.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'd1' });
    expect(update.data.scoreValue).toBe(72);
    expect(update.data.scoreBand).toBe('uncertain');
  });

  it('clamps score into 0..100', async () => {
    prisma.debtor.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', name: 'Acme' });
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.debtorInteraction.findMany.mockResolvedValue([]);
    llm.completeJson.mockResolvedValue({
      scoreValue: 140, scoreBand: 'likely', recommendedAction: 'gentle_reminder', rationale: 'x',
    });
    const result = await svc.scoreDebtor('c1', 'd1', asOf);
    expect(result.scoreValue).toBe(100);
  });
});
