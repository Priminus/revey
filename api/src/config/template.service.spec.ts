import { ConflictException, NotFoundException } from '@nestjs/common';
import { renderTemplate, buildVars, TemplateService } from './template.service';

describe('renderTemplate', () => {
  it('substitutes known vars and blanks unknown', () => {
    expect(renderTemplate('Hi {{debtor_name}}, you owe {{outstanding_amount}}. {{nope}}', {
      debtor_name: 'Acme', outstanding_amount: '$500',
    })).toBe('Hi Acme, you owe $500. ');
  });

  it('blanks prototype-chain keys instead of rendering them', () => {
    expect(
      renderTemplate('{{constructor}} {{toString}} {{debtor_name}}', { debtor_name: 'Acme' }),
    ).toBe('  Acme');
  });
});

describe('buildVars', () => {
  it('builds the supported variables incl. invoice_list', () => {
    const vars = buildVars('Acme', 86150_00, 3, 120, [
      { invoiceNumber: 'INV-31', amountDueCents: 45000_00, overdueDays: 120 },
    ]);
    expect(vars.debtor_name).toBe('Acme');
    expect(vars.outstanding_amount).toBe('$86,150');
    expect(vars.invoice_count).toBe('3');
    expect(vars.oldest_days_overdue).toBe('120');
    expect(vars.invoice_list).toContain('INV-31');
    expect(vars.invoice_list).toContain('120 days overdue');
  });
});

describe('TemplateService', () => {
  const prisma = {
    emailTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    reminderStep: {
      count: jest.fn(),
    },
  };
  const svc = new TemplateService(prisma as never);

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('queries global-or-client scope and tags rows with scope', async () => {
      prisma.emailTemplate.findMany.mockResolvedValue([
        { id: 't1', clientId: null, name: 'Global' },
        { id: 't2', clientId: 'c1', name: 'Client' },
      ]);

      const rows = await svc.list('c1');

      expect(prisma.emailTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ clientId: null }, { clientId: 'c1' }] },
        }),
      );
      expect(rows).toEqual([
        { id: 't1', clientId: null, name: 'Global', scope: 'global' },
        { id: 't2', clientId: 'c1', name: 'Client', scope: 'client' },
      ]);
    });
  });

  describe('create', () => {
    it('sets clientId null for global scope', () => {
      svc.create('c1', 'global', { name: 'n', subject: 's', body: 'b' });

      expect(prisma.emailTemplate.create).toHaveBeenCalledWith({
        data: { clientId: null, name: 'n', subject: 's', body: 'b' },
      });
    });

    it('sets clientId to the client for client scope', () => {
      svc.create('c1', 'client', { name: 'n', subject: 's', body: 'b' });

      expect(prisma.emailTemplate.create).toHaveBeenCalledWith({
        data: { clientId: 'c1', name: 'n', subject: 's', body: 'b' },
      });
    });
  });

  describe('update', () => {
    it('only forwards whitelisted fields, ignoring clientId/id spoofing', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'id1', clientId: 'c1' });
      prisma.emailTemplate.update.mockResolvedValue({ id: 'id1' });

      await svc.update('c1', 'id1', { name: 'x', clientId: 'evil', id: 'evil' } as never);

      expect(prisma.emailTemplate.update).toHaveBeenCalledWith({
        where: { id: 'id1' },
        data: { name: 'x' },
      });
    });

    it('throws NotFoundException when the template is missing or out of scope', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(null);

      await expect(svc.update('c1', 'id1', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.emailTemplate.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the template is missing or out of scope', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(null);

      await expect(svc.remove('c1', 'id1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.reminderStep.count).not.toHaveBeenCalled();
      expect(prisma.emailTemplate.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when referenced by a ReminderStep', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'id1', clientId: 'c1' });
      prisma.reminderStep.count.mockResolvedValue(1);

      await expect(svc.remove('c1', 'id1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.emailTemplate.delete).not.toHaveBeenCalled();
    });

    it('deletes when found in scope and not referenced', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'id1', clientId: 'c1' });
      prisma.reminderStep.count.mockResolvedValue(0);

      await svc.remove('c1', 'id1');

      expect(prisma.emailTemplate.delete).toHaveBeenCalledWith({ where: { id: 'id1' } });
    });
  });
});
