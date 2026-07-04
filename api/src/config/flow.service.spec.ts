import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { selectStepFor, FlowService } from './flow.service';

describe('selectStepFor', () => {
  const steps = [{ offsetDays: -7 }, { offsetDays: 1 }, { offsetDays: 14 }, { offsetDays: 30 }];
  it('picks the latest step at or before the overdue days', () => {
    expect(selectStepFor(0, steps)).toBe(0);
  });
  it('returns earliest when before the first offset', () => {
    expect(selectStepFor(-30, steps)).toBe(0);
  });
  it('picks the last step when well overdue', () => {
    expect(selectStepFor(90, steps)).toBe(3);
  });
  it('exact match selects that step', () => {
    expect(selectStepFor(14, steps)).toBe(2);
  });
  it('returns -1 for empty', () => {
    expect(selectStepFor(5, [])).toBe(-1);
  });
});

describe('FlowService', () => {
  const reminderFlow = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const reminderStep = {
    create: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  const emailTemplate = {
    findMany: jest.fn(),
  };
  const tx = { reminderFlow, reminderStep };
  const prisma = {
    reminderFlow,
    reminderStep,
    emailTemplate,
    $transaction: jest.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === 'function') {
        return (arg as (t: typeof tx) => unknown)(tx);
      }
      return undefined;
    }),
  };
  const svc = new FlowService(prisma as never);

  beforeEach(() => {
    emailTemplate.findMany.mockResolvedValue([{ id: 't1' }]);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getEffective', () => {
    it('scope=client with a client flow returns isOverride true + client steps', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce({
        id: 'flow-client',
        clientId: 'c1',
        steps: [
          { id: 's2', offsetDays: 14, order: 2, requireApproval: true, type: 'reminder', config: null, template: { id: 't2', name: 'Second' } },
          { id: 's1', offsetDays: -7, order: 1, requireApproval: false, type: 'reminder', config: null, template: { id: 't1', name: 'First' } },
        ],
      });

      const result = await svc.getEffective('c1', 'client');

      expect(prisma.reminderFlow.findUnique).toHaveBeenCalledWith({
        where: { clientId: 'c1' },
        include: { steps: { include: { template: true } } },
      });
      expect(result).toEqual({
        flowId: 'flow-client',
        isOverride: true,
        steps: [
          { id: 's1', offsetDays: -7, order: 1, templateId: 't1', templateName: 'First', requireApproval: false, type: 'reminder', config: null },
          { id: 's2', offsetDays: 14, order: 2, templateId: 't2', templateName: 'Second', requireApproval: true, type: 'reminder', config: null },
        ],
      });
    });

    it('scope=client with no client flow falls back to global with isOverride false', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce(null);
      prisma.reminderFlow.findFirst.mockResolvedValueOnce({
        id: 'flow-global',
        clientId: null,
        steps: [{ id: 's1', offsetDays: 1, order: 1, requireApproval: false, type: 'reminder', config: null, template: { id: 't1', name: 'Global' } }],
      });

      const result = await svc.getEffective('c1', 'client');

      expect(result).toEqual({
        flowId: 'flow-global',
        isOverride: false,
        steps: [{ id: 's1', offsetDays: 1, order: 1, templateId: 't1', templateName: 'Global', requireApproval: false, type: 'reminder', config: null }],
      });
    });

    it('scope=global returns global steps with isOverride false', async () => {
      prisma.reminderFlow.findFirst.mockResolvedValueOnce({
        id: 'flow-global',
        clientId: null,
        steps: [{ id: 's1', offsetDays: 1, order: 1, requireApproval: true, type: 'reminder', config: null, template: { id: 't1', name: 'Global' } }],
      });

      const result = await svc.getEffective('c1', 'global');

      expect(prisma.reminderFlow.findFirst).toHaveBeenCalledWith({
        where: { clientId: null },
        include: { steps: { include: { template: true } } },
      });
      expect(result).toEqual({
        flowId: 'flow-global',
        isOverride: false,
        steps: [{ id: 's1', offsetDays: 1, order: 1, templateId: 't1', templateName: 'Global', requireApproval: true, type: 'reminder', config: null }],
      });
    });

    it('maps non-reminder nodes with null template to a StepView with null templateId/templateName and its config', async () => {
      prisma.reminderFlow.findFirst.mockResolvedValueOnce({
        id: 'flow-global',
        clientId: null,
        steps: [
          { id: 's1', offsetDays: 1, order: 1, requireApproval: true, type: 'reminder', config: null, template: { id: 't1', name: 'Global' } },
          { id: 's2', offsetDays: 3, order: 2, requireApproval: true, type: 'wait', config: { days: 5 }, template: null },
        ],
      });

      const result = await svc.getEffective('c1', 'global');

      expect(result.steps).toEqual([
        { id: 's1', offsetDays: 1, order: 1, templateId: 't1', templateName: 'Global', requireApproval: true, type: 'reminder', config: null },
        { id: 's2', offsetDays: 3, order: 2, templateId: null, templateName: null, requireApproval: true, type: 'wait', config: { days: 5 } },
      ]);
    });
  });

  describe('customize', () => {
    it('creates a client flow and clones global steps when none exists', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce(null); // existing client flow check
      prisma.reminderFlow.findFirst.mockResolvedValueOnce({
        id: 'flow-global',
        clientId: null,
        steps: [
          { id: 's1', offsetDays: -7, order: 1, templateId: 't1', flowId: 'flow-global', requireApproval: false, type: 'reminder', config: null },
          { id: 's2', offsetDays: 14, order: 2, templateId: null, flowId: 'flow-global', requireApproval: true, type: 'wait', config: { days: 5 } },
        ],
      });
      prisma.reminderFlow.create.mockResolvedValue({ id: 'flow-client', clientId: 'c1' });

      await svc.customize('c1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.reminderFlow.create).toHaveBeenCalledWith({ data: { clientId: 'c1' } });
      expect(prisma.reminderStep.createMany).toHaveBeenCalledWith({
        data: [
          { flowId: 'flow-client', offsetDays: -7, templateId: 't1', order: 1, requireApproval: false, type: 'reminder', config: Prisma.JsonNull },
          { flowId: 'flow-client', offsetDays: 14, templateId: null, order: 2, requireApproval: true, type: 'wait', config: { days: 5 } },
        ],
      });
    });

    it('swallows a P2002 unique-constraint race (concurrent customize already created the flow)', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce(null); // existing client flow check
      prisma.reminderFlow.findFirst.mockResolvedValueOnce({ id: 'flow-global', clientId: null, steps: [] });
      prisma.$transaction.mockImplementationOnce(async () => {
        const err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        throw err;
      });

      await expect(svc.customize('c1')).resolves.toBeUndefined();
    });

    it('is a no-op when a client flow already exists', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce({ id: 'flow-client', clientId: 'c1' });

      await svc.customize('c1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.reminderFlow.create).not.toHaveBeenCalled();
      expect(prisma.reminderStep.createMany).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('deletes the client flow when it exists', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce({ id: 'flow-client', clientId: 'c1' });

      await svc.reset('c1');

      expect(prisma.reminderFlow.delete).toHaveBeenCalledWith({ where: { id: 'flow-client' } });
    });

    it('is a no-op when no client flow exists', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce(null);

      await svc.reset('c1');

      expect(prisma.reminderFlow.delete).not.toHaveBeenCalled();
    });
  });

  describe('replaceSteps', () => {
    it('throws ConflictException for scope=client when the client flow does not exist', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce(null);

      await expect(
        svc.replaceSteps('c1', 'client', [{ offsetDays: 1, templateId: 't1', order: 1 }]),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.reminderStep.deleteMany).not.toHaveBeenCalled();
    });

    it('replaces steps for an existing scope=client flow', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce({ id: 'flow-client', clientId: 'c1' });

      await svc.replaceSteps('c1', 'client', [{ offsetDays: 1, templateId: 't1', order: 1 }]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.reminderStep.deleteMany).toHaveBeenCalledWith({ where: { flowId: 'flow-client' } });
      expect(prisma.reminderStep.createMany).toHaveBeenCalledWith({
        data: [{ flowId: 'flow-client', offsetDays: 1, templateId: 't1', order: 1, requireApproval: true, type: 'reminder', config: Prisma.JsonNull }],
      });
    });

    it('persists type and config and a nullable templateId; a wait node with no template saves without a template-scope error', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce({ id: 'flow-client', clientId: 'c1' });

      await svc.replaceSteps('c1', 'client', [
        { offsetDays: 1, templateId: 't1', order: 1, type: 'reminder', config: null },
        { offsetDays: 5, templateId: null, order: 2, type: 'wait', config: { days: 5 } },
      ]);

      // Only the reminder step's template is scope-checked; the wait node is excluded.
      expect(emailTemplate.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1'] }, OR: [{ clientId: null }, { clientId: 'c1' }] },
        select: { id: true },
      });
      expect(prisma.reminderStep.createMany).toHaveBeenCalledWith({
        data: [
          { flowId: 'flow-client', offsetDays: 1, templateId: 't1', order: 1, requireApproval: true, type: 'reminder', config: Prisma.JsonNull },
          { flowId: 'flow-client', offsetDays: 5, templateId: null, order: 2, requireApproval: true, type: 'wait', config: { days: 5 } },
        ],
      });
    });

    it('does not run template-scope validation when no step has a templateId (all non-reminder nodes)', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce({ id: 'flow-client', clientId: 'c1' });

      await svc.replaceSteps('c1', 'client', [
        { offsetDays: 5, templateId: null, order: 1, type: 'wait', config: { days: 5 } },
        { offsetDays: 7, order: 2, type: 'escalate', config: { note: 'call them' } },
      ]);

      expect(emailTemplate.findMany).not.toHaveBeenCalled();
      expect(prisma.reminderStep.createMany).toHaveBeenCalledWith({
        data: [
          { flowId: 'flow-client', offsetDays: 5, templateId: null, order: 1, requireApproval: true, type: 'wait', config: { days: 5 } },
          { flowId: 'flow-client', offsetDays: 7, templateId: null, order: 2, requireApproval: true, type: 'escalate', config: { note: 'call them' } },
        ],
      });
    });

    it('throws BadRequestException when a step type is not a known node type', async () => {
      await expect(
        svc.replaceSteps('c1', 'client', [{ offsetDays: 1, templateId: 't1', order: 1, type: 'bogus' }]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(emailTemplate.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('persists requireApproval when provided and defaults to true when omitted', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce({ id: 'flow-client', clientId: 'c1' });
      emailTemplate.findMany.mockResolvedValueOnce([{ id: 't1' }]);

      await svc.replaceSteps('c1', 'client', [
        { offsetDays: 1, templateId: 't1', order: 1, requireApproval: false },
        { offsetDays: 14, templateId: 't1', order: 2 },
      ]);

      expect(prisma.reminderStep.createMany).toHaveBeenCalledWith({
        data: [
          { flowId: 'flow-client', offsetDays: 1, templateId: 't1', order: 1, requireApproval: false, type: 'reminder', config: Prisma.JsonNull },
          { flowId: 'flow-client', offsetDays: 14, templateId: 't1', order: 2, requireApproval: true, type: 'reminder', config: Prisma.JsonNull },
        ],
      });
    });

    it('throws BadRequestException when requireApproval is not a boolean', async () => {
      await expect(
        svc.replaceSteps('c1', 'client', [
          { offsetDays: 1, templateId: 't1', order: 1, requireApproval: 'yes' as never },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(emailTemplate.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates the global flow row when missing for scope=global', async () => {
      // First null: flowFor(global) lookup. Second null: ensureGlobal()'s own lookup.
      prisma.reminderFlow.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.reminderFlow.create.mockResolvedValueOnce({ id: 'flow-global', clientId: null });

      await svc.replaceSteps('c1', 'global', [{ offsetDays: 1, templateId: 't1', order: 1 }]);

      expect(prisma.reminderFlow.create).toHaveBeenCalledWith({ data: { clientId: null } });
      expect(prisma.reminderStep.deleteMany).toHaveBeenCalledWith({ where: { flowId: 'flow-global' } });
    });

    it('throws BadRequestException when a templateId is not in-scope, and does not run the transaction', async () => {
      prisma.reminderFlow.findUnique.mockResolvedValueOnce({ id: 'flow-client', clientId: 'c1' });
      emailTemplate.findMany.mockResolvedValueOnce([]); // submitted templateId not found in scope

      await expect(
        svc.replaceSteps('c1', 'client', [{ offsetDays: 1, templateId: 'foreign-t1', order: 1 }]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.reminderStep.deleteMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when offsetDays is not an integer', async () => {
      await expect(
        svc.replaceSteps('c1', 'client', [{ offsetDays: 1.5, templateId: 't1', order: 1 }]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(emailTemplate.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('ensureGlobal', () => {
    it('returns existing global flow id without creating one', async () => {
      prisma.reminderFlow.findFirst.mockResolvedValueOnce({ id: 'flow-global', clientId: null });

      const id = await svc.ensureGlobal();

      expect(id).toBe('flow-global');
      expect(prisma.reminderFlow.create).not.toHaveBeenCalled();
    });

    it('creates the global flow row when absent', async () => {
      prisma.reminderFlow.findFirst.mockResolvedValueOnce(null);
      prisma.reminderFlow.create.mockResolvedValueOnce({ id: 'flow-global', clientId: null });

      const id = await svc.ensureGlobal();

      expect(id).toBe('flow-global');
      expect(prisma.reminderFlow.create).toHaveBeenCalledWith({ data: { clientId: null } });
    });
  });
});
