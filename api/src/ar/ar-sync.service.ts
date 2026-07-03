import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XeroApiService } from '../integrations/xero/xero-api.service';

export function toCents(n: number): number {
  return Math.round(n * 100);
}

interface XeroContact {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
}
interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Contact: { ContactID: string };
  DateString: string;
  DueDateString: string;
  Total: number;
  AmountDue: number;
  AmountPaid: number;
  Status: string;
  CurrencyCode: string;
}

@Injectable()
export class ArSyncService {
  constructor(
    private readonly xeroApi: XeroApiService,
    private readonly prisma: PrismaService,
  ) {}

  async sync(clientId: string): Promise<{ debtors: number; invoices: number }> {
    let debtorCount = 0;
    let invoiceCount = 0;

    // Contacts (paginated)
    for (let page = 1; ; page++) {
      const res = await this.xeroApi.get<{ Contacts?: XeroContact[] }>(
        clientId,
        `/Contacts?page=${page}`,
      );
      const contacts = res.Contacts ?? [];
      if (contacts.length === 0) break;
      for (const c of contacts) {
        await this.prisma.debtor.upsert({
          where: {
            clientId_xeroContactId: { clientId, xeroContactId: c.ContactID },
          },
          update: { name: c.Name, email: c.EmailAddress ?? null },
          create: {
            clientId,
            xeroContactId: c.ContactID,
            name: c.Name,
            email: c.EmailAddress ?? null,
          },
        });
        debtorCount++;
      }
    }

    // ACCREC invoices (paginated)
    for (let page = 1; ; page++) {
      const res = await this.xeroApi.get<{ Invoices?: XeroInvoice[] }>(
        clientId,
        `/Invoices?where=${encodeURIComponent('Type=="ACCREC"')}&page=${page}`,
      );
      const invoices = res.Invoices ?? [];
      if (invoices.length === 0) break;
      for (const inv of invoices) {
        const debtor = await this.prisma.debtor.findUnique({
          where: {
            clientId_xeroContactId: {
              clientId,
              xeroContactId: inv.Contact?.ContactID,
            },
          },
        });
        if (!debtor) continue;
        await this.prisma.invoice.upsert({
          where: {
            clientId_xeroInvoiceId: { clientId, xeroInvoiceId: inv.InvoiceID },
          },
          update: {
            debtorId: debtor.id,
            invoiceNumber: inv.InvoiceNumber,
            issueDate: new Date(inv.DateString),
            dueDate: new Date(inv.DueDateString),
            totalCents: toCents(inv.Total),
            amountDueCents: toCents(inv.AmountDue),
            amountPaidCents: toCents(inv.AmountPaid),
            status: inv.Status,
            currencyCode: inv.CurrencyCode,
          },
          create: {
            clientId,
            debtorId: debtor.id,
            xeroInvoiceId: inv.InvoiceID,
            invoiceNumber: inv.InvoiceNumber,
            issueDate: new Date(inv.DateString),
            dueDate: new Date(inv.DueDateString),
            totalCents: toCents(inv.Total),
            amountDueCents: toCents(inv.AmountDue),
            amountPaidCents: toCents(inv.AmountPaid),
            status: inv.Status,
            currencyCode: inv.CurrencyCode,
          },
        });
        invoiceCount++;
      }
    }

    return { debtors: debtorCount, invoices: invoiceCount };
  }
}
