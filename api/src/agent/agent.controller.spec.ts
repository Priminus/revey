import { AgentController } from './agent.controller';

describe('AgentController.run', () => {
  const scoring = {};
  const drafting = { draftForDebtor: jest.fn() };
  const approvals = { approveAndSend: jest.fn() };
  const prisma = { client: { findUnique: jest.fn() } };
  const controller = new AgentController(
    scoring as never,
    drafting as never,
    approvals as never,
    prisma as never,
  );

  afterEach(() => jest.clearAllMocks());

  it('drafts and does not auto-send when the client has autoSend=false', async () => {
    drafting.draftForDebtor.mockResolvedValue({ id: 'draft1' });
    prisma.client.findUnique.mockResolvedValue({ autoSend: false });

    const result = await controller.run('c1', 'd1');

    expect(drafting.draftForDebtor).toHaveBeenCalledWith('c1', 'd1');
    expect(approvals.approveAndSend).not.toHaveBeenCalled();
    expect(result).toEqual({ draftId: 'draft1', autoSent: false });
  });

  it('drafts then auto-sends when the client has autoSend=true', async () => {
    drafting.draftForDebtor.mockResolvedValue({ id: 'draft2' });
    prisma.client.findUnique.mockResolvedValue({ autoSend: true });
    approvals.approveAndSend.mockResolvedValue({ status: 'sent' });

    const result = await controller.run('c1', 'd2');

    expect(drafting.draftForDebtor).toHaveBeenCalledWith('c1', 'd2');
    expect(approvals.approveAndSend).toHaveBeenCalledWith('c1', 'draft2');
    expect(result).toEqual({ draftId: 'draft2', autoSent: true, result: { status: 'sent' } });
  });

  it('drafts before checking autoSend (call order)', async () => {
    const calls: string[] = [];
    drafting.draftForDebtor.mockImplementation(async () => {
      calls.push('draft');
      return { id: 'draft3' };
    });
    prisma.client.findUnique.mockImplementation(async () => {
      calls.push('read-settings');
      return { autoSend: true };
    });
    approvals.approveAndSend.mockImplementation(async () => {
      calls.push('approve');
      return { status: 'sent' };
    });

    await controller.run('c1', 'd3');

    expect(calls).toEqual(['draft', 'read-settings', 'approve']);
  });
});
