import { ForbiddenException } from '@nestjs/common';
import { TenantService } from './tenant.service';

describe('TenantService', () => {
  const prisma = {
    client: { findUnique: jest.fn(), findMany: jest.fn() },
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

  describe('resolveClientIdFor', () => {
    it('returns the requested client id when that client exists', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: 'client_requested' });
      const id = await service.resolveClientIdFor(
        { userId: 'user_a', clerkOrgId: null, role: null },
        'client_requested',
      );
      expect(id).toBe('client_requested');
      expect(prisma.client.findUnique).toHaveBeenCalledWith({
        where: { id: 'client_requested' },
      });
    });

    it('falls back to user-based resolution when no client is requested', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: 'client_a' });
      const id = await service.resolveClientIdFor(
        { userId: 'user_a', clerkOrgId: null, role: null },
        undefined,
      );
      expect(id).toBe('client_a');
      expect(prisma.client.findUnique).toHaveBeenCalledWith({
        where: { clerkUserId: 'user_a' },
      });
    });

    it('falls back to user-based resolution when the requested client does not exist', async () => {
      prisma.client.findUnique
        .mockResolvedValueOnce(null) // lookup by requested id
        .mockResolvedValueOnce({ id: 'client_a' }); // fallback lookup by clerkUserId
      const id = await service.resolveClientIdFor(
        { userId: 'user_a', clerkOrgId: null, role: null },
        'nonexistent_client',
      );
      expect(id).toBe('client_a');
      expect(prisma.client.findUnique).toHaveBeenNthCalledWith(1, {
        where: { id: 'nonexistent_client' },
      });
      expect(prisma.client.findUnique).toHaveBeenNthCalledWith(2, {
        where: { clerkUserId: 'user_a' },
      });
    });

    it('throws Forbidden when the requested client does not exist and the user maps to no client', async () => {
      prisma.client.findUnique.mockResolvedValue(null);
      await expect(
        service.resolveClientIdFor(
          { userId: 'user_x', clerkOrgId: null, role: null },
          'nonexistent_client',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listClients', () => {
    it('returns clients mapped to {id, name} ordered by name', async () => {
      prisma.client.findMany.mockResolvedValue([
        { id: 'c1', name: 'Acme Freight Co', clerkUserId: 'sample_acme' },
        { id: 'c2', name: 'Northwind Trading', clerkUserId: 'sample_northwind' },
      ]);
      const result = await service.listClients();
      expect(prisma.client.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual([
        { id: 'c1', name: 'Acme Freight Co' },
        { id: 'c2', name: 'Northwind Trading' },
      ]);
    });
  });
});
