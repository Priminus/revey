import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';

export type DraftRow = {
  id: string;
  debtorId: string;
  debtorName: string;
  subject: string;
  body: string;
  status: string;
  toEmailIntended: string | null;
  toEmailActual: string | null;
  scoreValueAtDraft: number | null;
  error: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  async listPending(clientId: string): Promise<DraftRow[]> {
    const drafts = await this.prisma.outreachDraft.findMany({
      where: { clientId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { debtor: { select: { name: true } } },
    });
    return drafts.map((d) => ({
      id: d.id,
      debtorId: d.debtorId,
      debtorName: d.debtor.name,
      subject: d.subject,
      body: d.body,
      status: d.status,
      toEmailIntended: d.toEmailIntended,
      toEmailActual: d.toEmailActual,
      scoreValueAtDraft: d.scoreValueAtDraft,
      error: d.error,
      sentAt: d.sentAt,
      createdAt: d.createdAt,
    }));
  }

  async edit(
    clientId: string,
    id: string,
    patch: { subject?: string; body?: string },
  ): Promise<void> {
    await this.requirePending(clientId, id);
    const data: { subject?: string; body?: string } = {};
    if (typeof patch.subject === 'string') data.subject = patch.subject;
    if (typeof patch.body === 'string') data.body = patch.body;
    await this.prisma.outreachDraft.update({ where: { id }, data });
  }

  async reject(clientId: string, id: string): Promise<void> {
    await this.requirePending(clientId, id);
    await this.prisma.outreachDraft.update({ where: { id }, data: { status: 'rejected' } });
  }

  async approveAndSend(
    clientId: string,
    id: string,
  ): Promise<{ status: 'sent' | 'failed'; error?: string }> {
    const draft = await this.prisma.outreachDraft.findFirst({ where: { id, clientId } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'pending') throw new BadRequestException('Draft is not pending');
    try {
      const sent = await this.messaging.sendEmail({
        toIntended: draft.toEmailIntended,
        subject: draft.subject,
        body: draft.body,
      });
      await this.prisma.outreachDraft.update({
        where: { id },
        data: { status: 'sent', sentAt: new Date(), toEmailActual: sent.toActual },
      });
      await this.prisma.debtorInteraction.create({
        data: {
          clientId,
          debtorId: draft.debtorId,
          type: 'email_sent',
          summary: `Sent: ${draft.subject}`,
        },
      });
      return { status: 'sent' as const };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'send failed';
      await this.prisma.outreachDraft.update({ where: { id }, data: { status: 'failed', error } });
      return { status: 'failed' as const, error };
    }
  }

  private async requirePending(
    clientId: string,
    id: string,
  ): Promise<{ id: string; clientId: string; status: string }> {
    const draft = await this.prisma.outreachDraft.findFirst({ where: { id, clientId } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'pending') throw new BadRequestException('Draft is not pending');
    return draft;
  }
}
