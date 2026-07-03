import { ArSyncService, toCents } from './ar-sync.service';

describe('toCents', () => {
  it('converts dollars to integer cents', () => {
    expect(toCents(45000)).toBe(4500000);
    expect(toCents(1200.5)).toBe(120050);
  });
});

describe('ArSyncService', () => {
  it('upserts debtors then invoices and returns counts', async () => {
    const get = jest.fn()
      .mockResolvedValueOnce({
        Contacts: [
          { ContactID: 'x-con-1', Name: 'Acme', EmailAddress: 'ar@acme.example' },
        ],
      })
      .mockResolvedValueOnce({ Contacts: [] }) // contacts page 2 empty
      .mockResolvedValueOnce({
        Invoices: [
          {
            InvoiceID: 'x-inv-1',
            InvoiceNumber: 'INV-1',
            Contact: { ContactID: 'x-con-1' },
            DateString: '2026-05-01T00:00:00',
            DueDateString: '2026-06-01T00:00:00',
            Total: 1000,
            AmountDue: 400,
            AmountPaid: 600,
            Status: 'AUTHORISED',
            CurrencyCode: 'SGD',
          },
        ],
      })
      .mockResolvedValueOnce({ Invoices: [] }); // invoices page 2 empty
    const xeroApi = { get };
    const prisma = {
      debtor: {
        upsert: jest.fn().mockResolvedValue({ id: 'd1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'd1' }),
      },
      invoice: { upsert: jest.fn() },
    };
    const svc = new ArSyncService(xeroApi as never, prisma as never);
    const result = await svc.sync('c1');

    expect(result).toEqual({ debtors: 1, invoices: 1 });
    const dUp = prisma.debtor.upsert.mock.calls[0][0];
    expect(dUp.where).toEqual({ clientId_xeroContactId: { clientId: 'c1', xeroContactId: 'x-con-1' } });
    expect(dUp.create.email).toBe('ar@acme.example');
    const iUp = prisma.invoice.upsert.mock.calls[0][0];
    expect(iUp.where).toEqual({ clientId_xeroInvoiceId: { clientId: 'c1', xeroInvoiceId: 'x-inv-1' } });
    expect(iUp.create.amountDueCents).toBe(40000);
    expect(iUp.create.debtorId).toBe('d1');
  });

  it('skips invoices with a missing/undefined Contact instead of crashing', async () => {
    const get = jest.fn()
      .mockResolvedValueOnce({
        Contacts: [
          { ContactID: 'x-con-1', Name: 'Acme', EmailAddress: 'ar@acme.example' },
        ],
      })
      .mockResolvedValueOnce({ Contacts: [] }) // contacts page 2 empty
      .mockResolvedValueOnce({
        Invoices: [
          {
            InvoiceID: 'x-inv-no-contact',
            InvoiceNumber: 'INV-2',
            // Contact intentionally omitted (archived/merged Xero contact)
            DateString: '2026-05-01T00:00:00',
            DueDateString: '2026-06-01T00:00:00',
            Total: 500,
            AmountDue: 500,
            AmountPaid: 0,
            Status: 'AUTHORISED',
            CurrencyCode: 'SGD',
          },
        ],
      })
      .mockResolvedValueOnce({ Invoices: [] }); // invoices page 2 empty
    const xeroApi = { get };
    const prisma = {
      debtor: {
        upsert: jest.fn().mockResolvedValue({ id: 'd1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'd1' }),
      },
      invoice: { upsert: jest.fn() },
    };
    const svc = new ArSyncService(xeroApi as never, prisma as never);
    const result = await svc.sync('c1');

    expect(result).toEqual({ debtors: 1, invoices: 0 });
    expect(prisma.debtor.findUnique).not.toHaveBeenCalled();
    expect(prisma.invoice.upsert).not.toHaveBeenCalled();
  });
});
