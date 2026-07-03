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
  redirectTo: string | null;
};

const EDITABLE_STATUSES = ['pending', 'failed'];

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  async listPending(clientId: string): Promise<DraftRow[]> {
    const drafts = await this.prisma.outreachDraft.findMany({
      where: { clientId, status: { in: ['pending', 'failed', 'sending'] } },
      orderBy: { createdAt: 'desc' },
      include: { debtor: { select: { name: true } } },
    });
    const redirectTo = this.messaging.redirectEmail || null;
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
      redirectTo,
    }));
  }

  async edit(
    clientId: string,
    id: string,
    patch: { subject?: string; body?: string },
  ): Promise<void> {
    await this.requireEditable(clientId, id);
    const data: { subject?: string; body?: string } = {};
    if (typeof patch.subject === 'string') data.subject = patch.subject;
    if (typeof patch.body === 'string') data.body = patch.body;
    await this.prisma.outreachDraft.update({ where: { id }, data });
  }

  async reject(clientId: string, id: string): Promise<void> {
    await this.requireEditable(clientId, id);
    await this.prisma.outreachDraft.update({ where: { id }, data: { status: 'rejected' } });
  }

  async approveAndSend(
    clientId: string,
    id: string,
  ): Promise<{ status: 'sent' | 'failed'; error?: string }> {
    // atomically claim a pending OR failed draft → 'sending' (prevents double-send)
    const claim = await this.prisma.outreachDraft.updateMany({
      where: { id, clientId, status: { in: ['pending', 'failed'] } },
      data: { status: 'sending', error: null },
    });
    if (claim.count === 0) {
      // either not found for this client, or not in a sendable state (already sent/sending)
      const exists = await this.prisma.outreachDraft.findFirst({
        where: { id, clientId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Draft not found');
      throw new BadRequestException('Draft is not awaiting approval');
    }
    const draft = await this.prisma.outreachDraft.findFirst({ where: { id, clientId } });
    if (!draft) throw new NotFoundException('Draft not found');
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

  private async requireEditable(
    clientId: string,
    id: string,
  ): Promise<{ id: string; clientId: string; status: string }> {
    const draft = await this.prisma.outreachDraft.findFirst({ where: { id, clientId } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (!EDITABLE_STATUSES.includes(draft.status)) {
      throw new BadRequestException('Draft is not awaiting approval');
    }
    return draft;
  }
}
