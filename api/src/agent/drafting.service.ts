import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { overdueDays } from '../ar/aging';
import { FlowService, selectStepFor } from '../config/flow.service';
import { renderTemplate, buildVars } from '../config/template.service';

const SYSTEM = `You are Revey, an AI collections assistant writing on behalf of a finance
team. Write a professional, courteous, brand-appropriate collection email. Reference the
specific overdue invoice numbers and amounts. Match the tone to the recommended action
(gentle_reminder = warm; firm_followup = direct; final_notice = firm but polite). Keep it
under 160 words. Do not threaten. End with a clear call to pay or reply.`;

const PERSONALIZE_SYSTEM = `You are Revey. Personalize this collection email: keep its
structure, tone, and all factual figures; make it read naturally for this specific debtor.
Do not invent facts. Return JSON {subject, body}.`;

interface DraftInvoice {
  amountDueCents: number;
  dueDate: Date;
  invoiceNumber: string;
}

@Injectable()
export class DraftingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly flowService: FlowService,
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

    const invoices: DraftInvoice[] = await this.prisma.invoice.findMany({
      where: { clientId, debtorId, amountDueCents: { gt: 0 } },
      select: { amountDueCents: true, dueDate: true, invoiceNumber: true },
    });

    const { steps } = await this.flowService.resolveForClient(clientId);

    if (steps.length > 0 && invoices.length > 0) {
      const oldestDaysOverdue = Math.max(
        ...invoices.map((i) => overdueDays(i.dueDate, asOf)),
      );
      const idx = selectStepFor(oldestDaysOverdue, steps);
      const step = steps[idx];
      const template = await this.prisma.emailTemplate.findUnique({
        where: { id: step.templateId },
      });

      if (template) {
        const totalOutstandingCents = invoices.reduce(
          (sum, i) => sum + i.amountDueCents,
          0,
        );
        const vars = buildVars(
          debtor.name,
          totalOutstandingCents,
          invoices.length,
          oldestDaysOverdue,
          invoices.map((i) => ({
            invoiceNumber: i.invoiceNumber,
            amountDueCents: i.amountDueCents,
            overdueDays: overdueDays(i.dueDate, asOf),
          })),
        );
        const filledSubject = renderTemplate(template.subject, vars);
        const filledBody = renderTemplate(template.body, vars);

        const personalized = await this.llm.completeJson<{
          subject: string;
          body: string;
        }>({
          system: PERSONALIZE_SYSTEM,
          user: `Subject: ${filledSubject}\n\n${filledBody}`,
          schemaHint: '{"subject":string,"body":string}',
          temperature: 0.4,
        });

        const subject =
          typeof personalized?.subject === 'string' && personalized.subject.length > 0
            ? personalized.subject
            : filledSubject;
        const body =
          typeof personalized?.body === 'string' && personalized.body.length > 0
            ? personalized.body
            : filledBody;

        const created = await this.prisma.outreachDraft.create({
          data: {
            clientId,
            debtorId,
            channel: 'email',
            subject,
            body,
            status: 'pending',
            toEmailIntended: debtor.email,
            scoreValueAtDraft: debtor.scoreValue,
            templateId: step.templateId,
            stepOffsetDays: step.offsetDays,
          },
          select: { id: true },
        });
        return { id: created.id };
      }
    }

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
        templateId: null,
        stepOffsetDays: null,
      },
      select: { id: true },
    });
    return { id: created.id };
  }
}
