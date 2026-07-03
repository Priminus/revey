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
          { id: 'd1', name: 'Small', email: null, invoices: [inv({ amountDueCents: 1000, dueDate: new Date('2026-06-25T00:00:00Z') })] },
          { id: 'd2', name: 'Big', email: 'b@x.co', invoices: [
            inv({ amountDueCents: 20000, dueDate: new Date('2026-03-01T00:00:00Z') }),
            inv({ amountDueCents: 0 }),
          ] },
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
  });

  it('throws when a debtor is not in the client', async () => {
    const prisma = { debtor: { findFirst: jest.fn().mockResolvedValue(null) }, invoice: { findMany: jest.fn() } };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    await expect(svc.getDebtor('c1', 'nope', asOf)).rejects.toBeInstanceOf(NotFoundException);
  });
});
