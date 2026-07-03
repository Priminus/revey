import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { overdueDays } from '../ar/aging';

export interface ScoreResult {
  scoreValue: number;
  scoreBand: 'likely' | 'uncertain' | 'at_risk';
  recommendedAction: string;
  rationale: string;
}

const SYSTEM = `You are a B2B collections analyst. Score a debtor's WILLINGNESS TO PAY
(0-100, higher = more likely to pay soon) based on their invoice aging and interaction
history — reason about behaviour, not just days overdue. Choose scoreBand from
likely|uncertain|at_risk and a concise recommendedAction (one of: gentle_reminder,
firm_followup, final_notice, phone_call, escalate_to_human). Give a one-sentence rationale.`;

const ALLOWED_BANDS = ['likely', 'uncertain', 'at_risk'] as const;

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async scoreDebtor(
    clientId: string,
    debtorId: string,
    asOf: Date = new Date(),
  ): Promise<ScoreResult> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, clientId },
    });
    if (!debtor) throw new NotFoundException('Debtor not found');

    const invoices = await this.prisma.invoice.findMany({
      where: { clientId, debtorId, amountDueCents: { gt: 0 } },
      select: { amountDueCents: true, dueDate: true, invoiceNumber: true },
    });
    const interactions = await this.prisma.debtorInteraction.findMany({
      where: { clientId, debtorId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const totalCents = invoices.reduce((s, i) => s + i.amountDueCents, 0);
    const lines = invoices
      .map(
        (i) =>
          `- ${i.invoiceNumber}: $${(i.amountDueCents / 100).toFixed(0)} due, ${overdueDays(i.dueDate, asOf)} days overdue`,
      )
      .join('\n');
    const history = interactions.length
      ? interactions.map((i) => `- ${i.type}: ${i.summary}`).join('\n')
      : '(no prior interactions)';

    const user = `Debtor: ${debtor.name}
Total outstanding: $${(totalCents / 100).toFixed(0)} across ${invoices.length} open invoices.
Open invoices:
${lines || '(none)'}
Recent interactions:
${history}`;

    const raw = await this.llm.completeJson<ScoreResult>({
      system: SYSTEM,
      user,
      schemaHint:
        '{"scoreValue":number(0-100),"scoreBand":"likely|uncertain|at_risk","recommendedAction":string,"rationale":string}',
    });

    const n = Number(raw.scoreValue);
    const scoreValue = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;

    const scoreBand = (ALLOWED_BANDS as readonly string[]).includes(raw.scoreBand)
      ? (raw.scoreBand as ScoreResult['scoreBand'])
      : 'uncertain';

    const recommendedAction =
      typeof raw.recommendedAction === 'string' && raw.recommendedAction.trim()
        ? raw.recommendedAction
        : 'firm_followup';

    const rationale = typeof raw.rationale === 'string' ? raw.rationale : '';

    const result: ScoreResult = {
      scoreValue,
      scoreBand,
      recommendedAction,
      rationale,
    };
    await this.prisma.debtor.update({
      where: { id: debtorId },
      data: {
        scoreValue: result.scoreValue,
        scoreBand: result.scoreBand,
        recommendedAction: result.recommendedAction,
        scoreRationale: result.rationale,
        scoredAt: asOf,
      },
    });
    return result;
  }

  async scoreAllOpen(clientId: string): Promise<{ scored: number }> {
    const debtors = await this.prisma.debtor.findMany({
      where: { clientId, invoices: { some: { amountDueCents: { gt: 0 } } } },
      select: { id: true },
    });
    for (const d of debtors) {
      await this.scoreDebtor(clientId, d.id);
    }
    return { scored: debtors.length };
  }
}
