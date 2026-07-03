import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArSyncService } from './ar-sync.service';
import {
  AgingBucket,
  bucketFor,
  overdueDays,
  summarizeAging,
} from './aging';

export interface ArSummary {
  totalOutstandingCents: number;
  overdueCents: number;
  debtorCount: number;
  openInvoiceCount: number;
  aging: Record<AgingBucket, { count: number; amountCents: number }>;
}

export interface DebtorRow {
  id: string;
  name: string;
  email: string | null;
  outstandingCents: number;
  worstOverdueDays: number;
  openInvoiceCount: number;
  scoreValue: number | null;
  scoreBand: string | null;
  recommendedAction: string | null;
  scoreRationale: string | null;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  totalCents: number;
  amountDueCents: number;
  status: string;
  overdueDays: number;
  bucket: AgingBucket;
}

export interface InteractionRow {
  id: string;
  type: string;
  summary: string;
  createdAt: Date;
}

export interface DebtorDetail {
  id: string;
  name: string;
  email: string | null;
  invoices: InvoiceRow[];
  scoreValue: number | null;
  scoreBand: string | null;
  recommendedAction: string | null;
  scoreRationale: string | null;
  interactions: InteractionRow[];
}

@Injectable()
export class ArService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: ArSyncService,
  ) {}

  syncFromXero(clientId: string): Promise<{ debtors: number; invoices: number }> {
    return this.sync.sync(clientId);
  }

  async summary(clientId: string, asOf: Date): Promise<ArSummary> {
    const invoices = await this.prisma.invoice.findMany({
      where: { clientId, amountDueCents: { gt: 0 } },
      select: { amountDueCents: true, dueDate: true, debtorId: true },
    });
    const open = invoices.filter((i) => i.amountDueCents > 0);
    const totalOutstandingCents = open.reduce((s, i) => s + i.amountDueCents, 0);
    const overdueCents = open
      .filter((i) => overdueDays(i.dueDate, asOf) > 0)
      .reduce((s, i) => s + i.amountDueCents, 0);
    const aging = summarizeAging(open, asOf);
    const debtorCount = new Set(open.map((i) => i.debtorId)).size;
    return {
      totalOutstandingCents,
      overdueCents,
      debtorCount,
      openInvoiceCount: open.length,
      aging,
    };
  }

  async listDebtors(clientId: string, asOf: Date): Promise<DebtorRow[]> {
    const debtors = await this.prisma.debtor.findMany({
      where: { clientId },
      include: { invoices: { where: { amountDueCents: { gt: 0 } } } },
    });
    return debtors
      .map((d) => {
        const open = d.invoices.filter((i) => i.amountDueCents > 0);
        const outstandingCents = open.reduce((s, i) => s + i.amountDueCents, 0);
        const worstOverdueDays = open.reduce(
          (m, i) => Math.max(m, overdueDays(i.dueDate, asOf)),
          Number.NEGATIVE_INFINITY,
        );
        return {
          id: d.id,
          name: d.name,
          email: d.email,
          outstandingCents,
          worstOverdueDays: open.length ? worstOverdueDays : 0,
          openInvoiceCount: open.length,
          scoreValue: d.scoreValue,
          scoreBand: d.scoreBand,
          recommendedAction: d.recommendedAction,
          scoreRationale: d.scoreRationale,
        };
      })
      .filter((r) => r.openInvoiceCount > 0)
      .sort((a, b) => b.outstandingCents - a.outstandingCents);
  }

  async getDebtor(
    clientId: string,
    id: string,
    asOf: Date,
  ): Promise<DebtorDetail> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id, clientId },
      include: { invoices: { orderBy: { dueDate: 'asc' } } },
    });
    if (!debtor) {
      throw new NotFoundException('Debtor not found');
    }
    const interactions = await this.prisma.debtorInteraction.findMany({
      where: { clientId, debtorId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      id: debtor.id,
      name: debtor.name,
      email: debtor.email,
      invoices: debtor.invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        totalCents: i.totalCents,
        amountDueCents: i.amountDueCents,
        status: i.status,
        overdueDays: overdueDays(i.dueDate, asOf),
        bucket: bucketFor(i.dueDate, asOf),
      })),
      scoreValue: debtor.scoreValue,
      scoreBand: debtor.scoreBand,
      recommendedAction: debtor.recommendedAction,
      scoreRationale: debtor.scoreRationale,
      interactions: interactions.map((i) => ({
        id: i.id,
        type: i.type,
        summary: i.summary,
        createdAt: i.createdAt,
      })),
    };
  }
}
