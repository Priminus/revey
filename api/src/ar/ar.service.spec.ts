import { NotFoundException } from '@nestjs/common';
import { ArService } from './ar.service';

const asOf = new Date('2026-07-02T00:00:00Z');

function inv(over: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 'i',
    invoiceNumber: 'INV',
    issueDate: new Date('2026-01-01T00:00:00Z'),
    dueDate: new Date('2026-06-01T00:00:00Z'),
    totalCents: 10000,
    amountDueCents: 10000,
    amountPaidCents: 0,
    status: 'AUTHORISED',
    ...over,
  };
}

describe('ArService', () => {
  it('summarizes outstanding, overdue and aging over open invoices', async () => {
    const prisma = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          inv({ amountDueCents: 5000, dueDate: new Date('2026-06-20T00:00:00Z') }), // 1-30
          inv({ amountDueCents: 3000, dueDate: new Date('2026-07-20T00:00:00Z') }), // current
          inv({ amountDueCents: 0 }), // paid — excluded
        ]),
      },
      debtor: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    const s = await svc.summary('c1', asOf);
    expect(s.totalOutstandingCents).toBe(8000);
    expect(s.overdueCents).toBe(5000);
    expect(s.openInvoiceCount).toBe(2);
    expect(s.aging.current.amountCents).toBe(3000);
    expect(s.aging['1-30'].amountCents).toBe(5000);
  });

  it('lists debtors with outstanding + worst overdue, open only, sorted desc', async () => {
    const prisma = {
      debtor: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'd1',
            name: 'Small',
            email: null,
            scoreValue: null,
            scoreBand: null,
            recommendedAction: null,
            scoreRationale: null,
            invoices: [inv({ amountDueCents: 1000, dueDate: new Date('2026-06-25T00:00:00Z') })],
          },
          {
            id: 'd2',
            name: 'Big',
            email: 'b@x.co',
            scoreValue: 72,
            scoreBand: 'likely',
            recommendedAction: 'gentle_reminder',
            scoreRationale: 'Pays reliably, just slow this cycle.',
            invoices: [
              inv({ amountDueCents: 20000, dueDate: new Date('2026-03-01T00:00:00Z') }),
              inv({ amountDueCents: 0 }),
            ],
          },
        ]),
      },
      invoice: { findMany: jest.fn() },
    };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    const rows = await svc.listDebtors('c1', asOf);
    expect(rows.map((r) => r.name)).toEqual(['Big', 'Small']);
    expect(rows[0].outstandingCents).toBe(20000);
    expect(rows[0].openInvoiceCount).toBe(1);
    expect(rows[0].worstOverdueDays).toBeGreaterThan(90);
    expect(rows[0].scoreValue).toBe(72);
    expect(rows[0].scoreBand).toBe('likely');
    expect(rows[0].recommendedAction).toBe('gentle_reminder');
    expect(rows[0].scoreRationale).toBe('Pays reliably, just slow this cycle.');
    expect(rows[1].scoreValue).toBeNull();
    expect(rows[1].scoreBand).toBeNull();
    expect(rows[1].recommendedAction).toBeNull();
    expect(rows[1].scoreRationale).toBeNull();
  });

  it('lists ALL vendors (no open-invoice filter), riskiest first with nulls last', async () => {
    const prisma = {
      debtor: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'd1',
            name: 'Unscored NoBalance',
            email: null,
            scoreValue: null,
            scoreBand: null,
            recommendedAction: null,
            scoreRationale: null,
            invoices: [],
          },
          {
            id: 'd2',
            name: 'Risky',
            email: 'r@x.co',
            scoreValue: 20,
            scoreBand: 'at_risk',
            recommendedAction: 'final_notice',
            scoreRationale: 'x',
            invoices: [inv({ amountDueCents: 5000, dueDate: new Date('2026-03-01T00:00:00Z') })],
          },
          {
            id: 'd3',
            name: 'Healthy',
            email: 'h@x.co',
            scoreValue: 80,
            scoreBand: 'likely',
            recommendedAction: 'gentle_reminder',
            scoreRationale: 'x',
            invoices: [],
          },
        ]),
      },
      invoice: { findMany: jest.fn() },
    };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    const rows = await svc.listVendors('c1', asOf);
    // Riskiest (lowest score) first; unscored (null) last.
    expect(rows.map((r) => r.name)).toEqual(['Risky', 'Healthy', 'Unscored NoBalance']);
    // Vendor with no open invoices still appears, with zeroed money fields.
    expect(rows[2].outstandingCents).toBe(0);
    expect(rows[2].openInvoiceCount).toBe(0);
    expect(rows[2].worstOverdueDays).toBe(0);
    expect(rows[0].outstandingCents).toBe(5000);
    expect(rows[0].worstOverdueDays).toBeGreaterThan(90);
  });

  it('tie-breaks equal scores by outstanding desc', async () => {
    const prisma = {
      debtor: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'd1', name: 'Low', email: null, scoreValue: 50, scoreBand: 'uncertain',
            recommendedAction: null, scoreRationale: null,
            invoices: [inv({ amountDueCents: 1000 })],
          },
          {
            id: 'd2', name: 'High', email: null, scoreValue: 50, scoreBand: 'uncertain',
            recommendedAction: null, scoreRationale: null,
            invoices: [inv({ amountDueCents: 9000 })],
          },
        ]),
      },
      invoice: { findMany: jest.fn() },
    };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    const rows = await svc.listVendors('c1', asOf);
    expect(rows.map((r) => r.name)).toEqual(['High', 'Low']);
  });

  it('includes score fields and interaction history on debtor detail', async () => {
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'd1',
          name: 'Acme',
          email: 'a@acme.co',
          scoreValue: 40,
          scoreBand: 'uncertain',
          recommendedAction: 'firm_reminder',
          scoreRationale: 'Two invoices slipping past 30 days.',
          invoices: [],
        }),
      },
      invoice: { findMany: jest.fn() },
      debtorInteraction: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'x1', type: 'email_sent', summary: 'Sent: Reminder', createdAt: new Date('2026-06-01T00:00:00Z') },
        ]),
      },
    };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    const detail = await svc.getDebtor('c1', 'd1', asOf);
    expect(detail.scoreValue).toBe(40);
    expect(detail.scoreBand).toBe('uncertain');
    expect(detail.recommendedAction).toBe('firm_reminder');
    expect(detail.scoreRationale).toBe('Two invoices slipping past 30 days.');
    expect(detail.interactions).toEqual([
      { id: 'x1', type: 'email_sent', summary: 'Sent: Reminder', createdAt: new Date('2026-06-01T00:00:00Z') },
    ]);
    expect(prisma.debtorInteraction.findMany).toHaveBeenCalledWith({
      where: { clientId: 'c1', debtorId: 'd1' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  });

  it('throws when a debtor is not in the client', async () => {
    const prisma = { debtor: { findFirst: jest.fn().mockResolvedValue(null) }, invoice: { findMany: jest.fn() } };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    await expect(svc.getDebtor('c1', 'nope', asOf)).rejects.toBeInstanceOf(NotFoundException);
  });
});
