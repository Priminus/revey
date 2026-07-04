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

  it('falls back to 50 when scoreValue is not a number', async () => {
    prisma.debtor.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', name: 'Acme' });
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.debtorInteraction.findMany.mockResolvedValue([]);
    llm.completeJson.mockResolvedValue({
      scoreValue: 'not a number',
      scoreBand: 'likely',
      recommendedAction: 'gentle_reminder',
      rationale: 'x',
    });
    const result = await svc.scoreDebtor('c1', 'd1', asOf);
    expect(Number.isFinite(result.scoreValue)).toBe(true);
    expect(result.scoreValue).toBe(50);
    const update = prisma.debtor.update.mock.calls[0][0];
    expect(update.data.scoreValue).toBe(50);
  });

  it('falls back to uncertain when scoreBand is not a valid enum value', async () => {
    prisma.debtor.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', name: 'Acme' });
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.debtorInteraction.findMany.mockResolvedValue([]);
    llm.completeJson.mockResolvedValue({
      scoreValue: 80,
      scoreBand: 'super_likely',
      recommendedAction: 'gentle_reminder',
      rationale: 'x',
    });
    const result = await svc.scoreDebtor('c1', 'd1', asOf);
    expect(result.scoreBand).toBe('uncertain');
    const update = prisma.debtor.update.mock.calls[0][0];
    expect(update.data.scoreBand).toBe('uncertain');
  });

  describe('scoreAllOpen', () => {
    it('continues past a single debtor failure and reports scored/failed counts', async () => {
      prisma.debtor.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);

      const spy = jest.spyOn(svc, 'scoreDebtor');
      spy.mockImplementationOnce(() =>
        Promise.reject(new Error('llm timeout')),
      );
      spy.mockImplementationOnce(() =>
        Promise.resolve({
          scoreValue: 60,
          scoreBand: 'uncertain',
          recommendedAction: 'firm_followup',
          rationale: 'x',
        }),
      );

      const result = await svc.scoreAllOpen('c1');

      expect(result).toEqual({ scored: 1, failed: 1 });
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it('scores only debtors with open invoices', async () => {
      prisma.debtor.findMany.mockResolvedValue([{ id: 'd1' }]);
      const spy = jest.spyOn(svc, 'scoreDebtor').mockResolvedValue({
        scoreValue: 60, scoreBand: 'uncertain', recommendedAction: 'firm_followup', rationale: 'x',
      });
      await svc.scoreAllOpen('c1');
      expect(prisma.debtor.findMany).toHaveBeenCalledWith({
        where: { clientId: 'c1', invoices: { some: { amountDueCents: { gt: 0 } } } },
        select: { id: true },
      });
      spy.mockRestore();
    });
  });

  describe('scoreAll', () => {
    it('scores EVERY debtor for the client and reports scored/failed counts', async () => {
      prisma.debtor.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }]);

      const spy = jest.spyOn(svc, 'scoreDebtor');
      spy.mockResolvedValueOnce({
        scoreValue: 60, scoreBand: 'uncertain', recommendedAction: 'firm_followup', rationale: 'x',
      });
      spy.mockRejectedValueOnce(new Error('llm timeout'));
      spy.mockResolvedValueOnce({
        scoreValue: 80, scoreBand: 'likely', recommendedAction: 'gentle_reminder', rationale: 'x',
      });

      const result = await svc.scoreAll('c1');

      expect(result).toEqual({ scored: 2, failed: 1 });
      // No open-invoice filter — every debtor is fetched.
      expect(prisma.debtor.findMany).toHaveBeenCalledWith({
        where: { clientId: 'c1' },
        select: { id: true },
      });
      expect(spy).toHaveBeenCalledTimes(3);
      spy.mockRestore();
    });
  });
});
