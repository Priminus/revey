import { ForbiddenException } from '@nestjs/common';
import { TenantService } from './tenant.service';

describe('TenantService', () => {
  const prisma = {
    client: { findUnique: jest.fn() },
    debtor: { findMany: jest.fn() },
  };
  const service = new TenantService(prisma as never);

  afterEach(() => jest.clearAllMocks());

  it('resolves clientId from the clerk org', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'client_a' });
    const id = await service.resolveClientId({
      userId: 'u',
      clerkOrgId: 'org_a',
      role: 'admin',
    });
    expect(id).toBe('client_a');
  });

  it('forbids when the org maps to no client', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(
      service.resolveClientId({ userId: 'u', clerkOrgId: 'org_x', role: null }),
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
