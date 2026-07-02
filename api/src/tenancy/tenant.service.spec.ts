import { ForbiddenException } from '@nestjs/common';
import { TenantService } from './tenant.service';

describe('TenantService', () => {
  const prisma = {
    client: { findUnique: jest.fn() },
    debtor: { findMany: jest.fn() },
  };
  const service = new TenantService(prisma as never);

  afterEach(() => jest.clearAllMocks());

  it('resolves clientId from the clerk user', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'client_a' });
    const id = await service.resolveClientId({
      userId: 'user_a',
      clerkOrgId: null,
      role: null,
    });
    expect(id).toBe('client_a');
    expect(prisma.client.findUnique).toHaveBeenCalledWith({
      where: { clerkUserId: 'user_a' },
    });
  });

  it('forbids when the user maps to no client', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(
      service.resolveClientId({ userId: 'user_x', clerkOrgId: null, role: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only the requested client\'s debtors', async () => {
    prisma.debtor.findMany.mockResolvedValue([{ id: 'd1', clientId: 'client_a' }]);
    await service.debtorsForClient('client_a');
    expect(prisma.debtor.findMany).toHaveBeenCalledWith({
      where: { clientId: 'client_a' },
    });
  });
});
