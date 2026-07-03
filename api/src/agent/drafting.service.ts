import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { overdueDays } from '../ar/aging';

const SYSTEM = `You are Revey, an AI collections assistant writing on behalf of a finance
team. Write a professional, courteous, brand-appropriate collection email. Reference the
specific overdue invoice numbers and amounts. Match the tone to the recommended action
(gentle_reminder = warm; firm_followup = direct; final_notice = firm but polite). Keep it
under 160 words. Do not threaten. End with a clear call to pay or reply.`;

@Injectable()
export class DraftingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async draftForDebtor(
    clientId: string,
    debtorId: string,
    asOf: Date = new Date(),
  ): Promise<{ id: string }> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, clientId },
    });
    if (!debtor) throw new NotFoundException('Debtor not found');

    const invoices = await this.prisma.invoice.findMany({
      where: { clientId, debtorId, amountDueCents: { gt: 0 } },
      select: { amountDueCents: true, dueDate: true, invoiceNumber: true },
    });
    const lines = invoices
      .map(
        (i) =>
          `- ${i.invoiceNumber}: $${(i.amountDueCents / 100).toFixed(0)}, ${overdueDays(i.dueDate, asOf)} days overdue`,
      )
      .join('\n');

    const draft = await this.llm.completeJson<{ subject: string; body: string }>({
      system: SYSTEM,
      user: `Debtor: ${debtor.name}
Recommended action: ${debtor.recommendedAction ?? 'firm_followup'}
Overdue invoices:
${lines || '(none)'}`,
      schemaHint: '{"subject":string,"body":string}',
      temperature: 0.4,
    });

    const created = await this.prisma.outreachDraft.create({
      data: {
        clientId,
        debtorId,
        channel: 'email',
        subject: draft.subject,
        body: draft.body,
        status: 'pending',
        toEmailIntended: debtor.email,
        scoreValueAtDraft: debtor.scoreValue,
      },
      select: { id: true },
    });
    return { id: created.id };
  }
}
