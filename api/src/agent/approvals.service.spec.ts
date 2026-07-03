import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';

describe('ApprovalsService', () => {
  const prisma = {
    outreachDraft: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    debtorInteraction: { create: jest.fn() },
  };
  const messaging = { sendEmail: jest.fn(), redirectEmail: '' };
  const svc = new ApprovalsService(prisma as never, messaging as never);

  afterEach(() => jest.clearAllMocks());

  describe('listPending', () => {
    it('maps debtor name and returns pending/failed/sending drafts newest first', async () => {
      const createdAt = new Date('2026-07-01T00:00:00Z');
      prisma.outreachDraft.findMany.mockResolvedValue([
        {
          id: 'd1',
          debtorId: 'deb1',
          debtor: { name: 'Acme Co' },
          subject: 'Overdue invoice',
          body: 'Please pay',
          status: 'pending',
          toEmailIntended: 'ap@acme.com',
          toEmailActual: null,
          scoreValueAtDraft: 60,
          error: null,
          sentAt: null,
          createdAt,
        },
      ]);

      const rows = await svc.listPending('c1');

      expect(prisma.outreachDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'c1', status: { in: ['pending', 'failed', 'sending'] } },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(rows).toEqual([
        {
          id: 'd1',
          debtorId: 'deb1',
          debtorName: 'Acme Co',
          subject: 'Overdue invoice',
          body: 'Please pay',
          status: 'pending',
          toEmailIntended: 'ap@acme.com',
          toEmailActual: null,
          scoreValueAtDraft: 60,
          error: null,
          sentAt: null,
          createdAt,
          redirectTo: null,
        },
      ]);
    });

    it('includes redirectTo when messaging has a redirect configured', async () => {
      const messagingWithRedirect = { sendEmail: jest.fn(), redirectEmail: 'ops@test.com' };
      const svcWithRedirect = new ApprovalsService(prisma as never, messagingWithRedirect as never);
      prisma.outreachDraft.findMany.mockResolvedValue([
        {
          id: 'd1',
          debtorId: 'deb1',
          debtor: { name: 'Acme Co' },
          subject: 'Overdue invoice',
          body: 'Please pay',
          status: 'pending',
          toEmailIntended: 'ap@acme.com',
          toEmailActual: null,
          scoreValueAtDraft: 60,
          error: null,
          sentAt: null,
          createdAt: new Date('2026-07-01T00:00:00Z'),
        },
      ]);

      const rows = await svcWithRedirect.listPending('c1');
      expect(rows[0].redirectTo).toBe('ops@test.com');
    });
  });

  describe('approveAndSend', () => {
    it('atomically claims the draft, sends the email, marks it sent, and logs an interaction', async () => {
      prisma.outreachDraft.updateMany.mockResolvedValue({ count: 1 });
      prisma.outreachDraft.findFirst.mockResolvedValue({
        id: 'd1',
        clientId: 'c1',
        debtorId: 'deb1',
        subject: 'Overdue invoice',
        body: 'Please pay',
        status: 'sending',
        toEmailIntended: 'ap@acme.com',
      });
      messaging.sendEmail.mockResolvedValue({
        messageId: 'm1',
        toActual: 'redirect@test.com',
        redirected: true,
      });

      const result = await svc.approveAndSend('c1', 'd1');

      expect(prisma.outreachDraft.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', clientId: 'c1', status: { in: ['pending', 'failed'] } },
        data: { status: 'sending', error: null },
      });
      expect(result).toEqual({ status: 'sent' });
      expect(messaging.sendEmail).toHaveBeenCalledWith({
        toIntended: 'ap@acme.com',
        subject: 'Overdue invoice',
        body: 'Please pay',
      });
      const update = prisma.outreachDraft.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'd1' });
      expect(update.data.status).toBe('sent');
      expect(update.data.toEmailActual).toBe('redirect@test.com');
      expect(update.data.sentAt).toBeInstanceOf(Date);

      expect(prisma.debtorInteraction.create).toHaveBeenCalledWith({
        data: {
          clientId: 'c1',
          debtorId: 'deb1',
          type: 'email_sent',
          summary: 'Sent: Overdue invoice',
        },
      });
    });

    it('claims a failed draft too (retry), sends, and marks it sent', async () => {
      prisma.outreachDraft.updateMany.mockResolvedValue({ count: 1 });
      prisma.outreachDraft.findFirst.mockResolvedValue({
        id: 'd1',
        clientId: 'c1',
        debtorId: 'deb1',
        subject: 'Overdue invoice',
        body: 'Please pay',
        status: 'sending',
        toEmailIntended: 'ap@acme.com',
      });
      messaging.sendEmail.mockResolvedValue({
        messageId: 'm1',
        toActual: 'ap@acme.com',
        redirected: false,
      });

      const result = await svc.approveAndSend('c1', 'd1');

      expect(prisma.outreachDraft.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', clientId: 'c1', status: { in: ['pending', 'failed'] } },
        data: { status: 'sending', error: null },
      });
      expect(result).toEqual({ status: 'sent' });
    });

    it('does not throw when the send fails, marks the draft failed with the error', async () => {
      prisma.outreachDraft.updateMany.mockResolvedValue({ count: 1 });
      prisma.outreachDraft.findFirst.mockResolvedValue({
        id: 'd1',
        clientId: 'c1',
        debtorId: 'deb1',
        subject: 'Overdue invoice',
        body: 'Please pay',
        status: 'sending',
        toEmailIntended: 'ap@acme.com',
      });
      messaging.sendEmail.mockRejectedValue(new Error('Postmark send failed: 500'));

      const result = await svc.approveAndSend('c1', 'd1');

      expect(result).toEqual({ status: 'failed', error: 'Postmark send failed: 500' });
      expect(prisma.outreachDraft.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: 'failed', error: 'Postmark send failed: 500' },
      });
      expect(prisma.debtorInteraction.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the claim fails and no draft exists for this client', async () => {
      prisma.outreachDraft.updateMany.mockResolvedValue({ count: 0 });
      prisma.outreachDraft.findFirst.mockResolvedValue(null);
      await expect(svc.approveAndSend('c1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the claim fails but the draft exists (already sent/sending)', async () => {
      prisma.outreachDraft.updateMany.mockResolvedValue({ count: 0 });
      prisma.outreachDraft.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(svc.approveAndSend('c1', 'd1')).rejects.toThrow(BadRequestException);
      expect(messaging.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('sets status rejected from pending', async () => {
      prisma.outreachDraft.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', status: 'pending' });

      await svc.reject('c1', 'd1');

      expect(prisma.outreachDraft.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: 'rejected' },
      });
    });

    it('allows rejecting a failed draft', async () => {
      prisma.outreachDraft.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', status: 'failed' });

      await svc.reject('c1', 'd1');

      expect(prisma.outreachDraft.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: 'rejected' },
      });
    });

    it('throws NotFoundException for a missing draft', async () => {
      prisma.outreachDraft.findFirst.mockResolvedValue(null);
      await expect(svc.reject('c1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for a non-pending/failed draft', async () => {
      prisma.outreachDraft.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', status: 'sent' });
      await expect(svc.reject('c1', 'd1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('edit', () => {
    it('updates subject/body while pending', async () => {
      prisma.outreachDraft.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', status: 'pending' });

      await svc.edit('c1', 'd1', { subject: 'New subject' });

      expect(prisma.outreachDraft.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { subject: 'New subject' },
      });
    });

    it('allows editing a failed draft', async () => {
      prisma.outreachDraft.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', status: 'failed' });

      await svc.edit('c1', 'd1', { subject: 'New subject' });

      expect(prisma.outreachDraft.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { subject: 'New subject' },
      });
    });

    it('throws on a non-pending/failed draft', async () => {
      prisma.outreachDraft.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', status: 'sent' });
      await expect(svc.edit('c1', 'd1', { subject: 'New subject' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.outreachDraft.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing draft', async () => {
      prisma.outreachDraft.findFirst.mockResolvedValue(null);
      await expect(svc.edit('c1', 'missing', { subject: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('whitelists fields, ignoring status/sentAt injected via the patch object', async () => {
      prisma.outreachDraft.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', status: 'pending' });

      await svc.edit('c1', 'draft1', { subject: 'New', status: 'sent', sentAt: new Date() } as never);

      expect(prisma.outreachDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft1' },
        data: { subject: 'New' },
      });
      const update = prisma.outreachDraft.update.mock.calls[0][0];
      expect(update.data).not.toHaveProperty('status');
      expect(update.data).not.toHaveProperty('sentAt');
    });
  });
});
