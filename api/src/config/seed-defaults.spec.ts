import { ensureDefaults } from './seed-defaults';

describe('ensureDefaults', () => {
  const emailTemplate = {
    create: jest.fn(),
  };
  const reminderFlow = {
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  const reminderStep = {
    count: jest.fn(),
    create: jest.fn(),
  };
  const tx = { emailTemplate, reminderFlow, reminderStep };
  const prisma = {
    emailTemplate,
    reminderFlow,
    reminderStep,
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (t: typeof tx) => unknown)(tx);
      }
      return undefined;
    }),
  };

  afterEach(() => jest.clearAllMocks());

  it('creates 4 templates + a global flow + 4 steps at offsets [-7, 1, 14, 30] when none exist', async () => {
    reminderFlow.findFirst.mockResolvedValue(null);
    reminderStep.count.mockResolvedValue(0);
    reminderFlow.create.mockResolvedValue({ id: 'flow-global' });
    let templateSeq = 0;
    emailTemplate.create.mockImplementation(() => Promise.resolve({ id: `tpl-${templateSeq++}` }));
    reminderStep.create.mockResolvedValue({});

    await ensureDefaults(prisma as never);

    expect(emailTemplate.create).toHaveBeenCalledTimes(4);
    for (const call of emailTemplate.create.mock.calls) {
      const data = call[0].data;
      expect(data.clientId).toBeNull();
      expect(typeof data.subject).toBe('string');
      expect(typeof data.body).toBe('string');
    }

    expect(reminderFlow.create).toHaveBeenCalledTimes(1);
    expect(reminderFlow.create).toHaveBeenCalledWith({ data: { clientId: null } });

    expect(reminderStep.create).toHaveBeenCalledTimes(4);
    const offsets = reminderStep.create.mock.calls.map((call) => call[0].data.offsetDays);
    expect(offsets.sort((a: number, b: number) => a - b)).toEqual([-7, 1, 14, 30]);

    const orders = reminderStep.create.mock.calls.map((call) => call[0].data.order).sort((a: number, b: number) => a - b);
    expect(orders).toEqual([0, 1, 2, 3]);

    for (const call of reminderStep.create.mock.calls) {
      expect(call[0].data.flowId).toBe('flow-global');
      expect(typeof call[0].data.templateId).toBe('string');
    }
  });

  it('is idempotent: does nothing when the global flow already has steps', async () => {
    reminderFlow.findFirst.mockResolvedValue({ id: 'flow-global' });
    reminderStep.count.mockResolvedValue(4);

    await ensureDefaults(prisma as never);

    expect(emailTemplate.create).not.toHaveBeenCalled();
    expect(reminderFlow.create).not.toHaveBeenCalled();
    expect(reminderStep.create).not.toHaveBeenCalled();
  });

  it('reuses an existing global flow row when creating steps for the first time', async () => {
    reminderFlow.findFirst.mockResolvedValue({ id: 'flow-existing' });
    reminderStep.count.mockResolvedValue(0);
    let templateSeq = 0;
    emailTemplate.create.mockImplementation(() => Promise.resolve({ id: `tpl-${templateSeq++}` }));
    reminderStep.create.mockResolvedValue({});

    await ensureDefaults(prisma as never);

    expect(reminderFlow.create).not.toHaveBeenCalled();
    expect(reminderStep.create).toHaveBeenCalledTimes(4);
    for (const call of reminderStep.create.mock.calls) {
      expect(call[0].data.flowId).toBe('flow-existing');
    }
  });
});
