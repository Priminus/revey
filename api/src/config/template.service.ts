import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TemplateVars = Record<string, string>;

function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '',
  );
}

export function buildVars(
  debtorName: string,
  outstandingCents: number,
  invoiceCount: number,
  oldestDaysOverdue: number,
  invoices: { invoiceNumber: string; amountDueCents: number; overdueDays: number }[],
): TemplateVars {
  return {
    debtor_name: debtorName,
    outstanding_amount: formatCents(outstandingCents),
    invoice_count: String(invoiceCount),
    oldest_days_overdue: String(oldestDaysOverdue),
    invoice_list: invoices
      .map((i) => `${i.invoiceNumber} — ${formatCents(i.amountDueCents)}, ${i.overdueDays} days overdue`)
      .join('\n'),
  };
}

export type TemplateScope = 'global' | 'client';

@Injectable()
export class TemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clientId: string) {
    const rows = await this.prisma.emailTemplate.findMany({
      where: { OR: [{ clientId: null }, { clientId }] },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((t) => ({ ...t, scope: t.clientId ? 'client' : 'global' }));
  }

  create(clientId: string, scope: TemplateScope, data: { name: string; subject: string; body: string }) {
    return this.prisma.emailTemplate.create({
      data: {
        clientId: scope === 'global' ? null : clientId,
        name: data.name,
        subject: data.subject,
        body: data.body,
      },
    });
  }

  async update(clientId: string, id: string, patch: { name?: string; subject?: string; body?: string }) {
    // scope guard: only global or this client's template
    const existing = await this.prisma.emailTemplate.findFirst({
      where: { id, OR: [{ clientId: null }, { clientId }] },
    });
    if (!existing) throw new NotFoundException('Template not found in scope');
    const data: { name?: string; subject?: string; body?: string } = {};
    if (typeof patch.name === 'string') data.name = patch.name;
    if (typeof patch.subject === 'string') data.subject = patch.subject;
    if (typeof patch.body === 'string') data.body = patch.body;
    return this.prisma.emailTemplate.update({ where: { id }, data });
  }

  async remove(clientId: string, id: string): Promise<void> {
    const existing = await this.prisma.emailTemplate.findFirst({
      where: { id, OR: [{ clientId: null }, { clientId }] },
    });
    if (!existing) throw new NotFoundException('Template not found in scope');
    const refs = await this.prisma.reminderStep.count({ where: { templateId: id } });
    if (refs > 0) throw new ConflictException('Template is used by a reminder step');
    await this.prisma.emailTemplate.delete({ where: { id } });
  }
}
