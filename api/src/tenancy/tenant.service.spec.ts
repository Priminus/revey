import { ForbiddenException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { AdminService } from './admin.service';

describe('TenantService', () => {
  const prisma = {
    client: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    clientMembership: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    debtor: { findMany: jest.fn() },
  };
  const originalEnv = process.env.REVEY_ADMIN_USER_IDS;
  const adminService = new AdminService();
  const service = new TenantService(prisma as never, adminService);

  const adminAuth = { userId: 'user_admin', clerkOrgId: null, role: null };
  const memberAuth = { userId: 'user_member', clerkOrgId: null, role: null };

  beforeEach(() => {
    process.env.REVEY_ADMIN_USER_IDS = 'user_admin';
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.REVEY_ADMIN_USER_IDS = originalEnv;
  });

  describe('accessibleClientIds', () => {
    it('returns "all" for an admin user', async () => {
      const result = await service.accessibleClientIds('user_admin');
      expect(result).toBe('all');
      expect(prisma.client.findMany).not.toHaveBeenCalled();
    });

    it('returns owned + membership client ids for a member', async () => {
      prisma.client.findMany.mockResolvedValue([{ id: 'client_owned' }]);
      prisma.clientMembership.findMany.mockResolvedValue([
        { clientId: 'client_member_1' },
        { clientId: 'client_member_2' },
      ]);
      const result = await service.accessibleClientIds('user_member');
      expect(result).toEqual([
        'client_owned',
        'client_member_1',
        'client_member_2',
      ]);
      expect(prisma.client.findMany).toHaveBeenCalledWith({
        where: { clerkUserId: 'user_member' },
        select: { id: true },
      });
      expect(prisma.clientMembership.findMany).toHaveBeenCalledWith({
        where: { clerkUserId: 'user_member' },
        select: { clientId: true },
      });
    });
  });

  describe('resolveClientIdFor', () => {
    it('admin + any requested existing client id returns it', async () => {
      prisma.client.findFirst.mockResolvedValue({ id: 'client_x' });
      const id = await service.resolveClientIdFor(adminAuth, 'client_x');
      expect(id).toBe('client_x');
      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { id: 'client_x' },
      });
    });

    it('member requesting a client they do not have access to throws Forbidden', async () => {
      prisma.client.findMany.mockResolvedValue([{ id: 'client_owned' }]);
      prisma.clientMembership.findMany.mockResolvedValue([]);
      await expect(
        service.resolveClientIdFor(memberAuth, 'client_other'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('member with no header defaults to their own accessible client', async () => {
      prisma.client.findMany.mockResolvedValue([{ id: 'client_owned' }]);
      prisma.clientMembership.findMany.mockResolvedValue([]);
      const id = await service.resolveClientIdFor(memberAuth, undefined);
      expect(id).toBe('client_owned');
    });

    it('admin with no header defaults to the client they own', async () => {
      prisma.client.findFirst.mockResolvedValue({ id: 'client_owned_by_admin' });
      const id = await service.resolveClientIdFor(adminAuth, undefined);
      expect(id).toBe('client_owned_by_admin');
      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { clerkUserId: 'user_admin' },
      });
    });

    it('admin with no owned client and no header falls back to first client by name', async () => {
      prisma.client.findFirst
        .mockResolvedValueOnce(null) // owned lookup
        .mockResolvedValueOnce({ id: 'client_first' }); // fallback by name
      const id = await service.resolveClientIdFor(adminAuth, undefined);
      expect(id).toBe('client_first');
      expect(prisma.client.findFirst).toHaveBeenNthCalledWith(2, {
        orderBy: { name: 'asc' },
      });
    });

    it('throws Forbidden when member has no accessible clients and no header', async () => {
      prisma.client.findMany.mockResolvedValue([]);
      prisma.clientMembership.findMany.mockResolvedValue([]);
      await expect(
        service.resolveClientIdFor(memberAuth, undefined),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('member requesting a client they DO have access to returns it', async () => {
      prisma.client.findMany.mockResolvedValue([{ id: 'client_owned' }]);
      prisma.clientMembership.findMany.mockResolvedValue([
        { clientId: 'client_member_1' },
      ]);
      const id = await service.resolveClientIdFor(memberAuth, 'client_member_1');
      expect(id).toBe('client_member_1');
    });

    it('admin requesting a nonexistent client falls back to default resolution', async () => {
      prisma.client.findFirst
        .mockResolvedValueOnce(null) // requested lookup fails
        .mockResolvedValueOnce({ id: 'client_owned_by_admin' }); // default: owned
      const id = await service.resolveClientIdFor(adminAuth, 'client_missing');
      expect(id).toBe('client_owned_by_admin');
    });
  });

  describe('listClients', () => {
    it('admin sees all clients with isSelf flags', async () => {
      prisma.client.findMany.mockResolvedValue([
        { id: 'c1', name: 'Acme', clerkUserId: 'user_admin' },
        { id: 'c2', name: 'Northwind', clerkUserId: 'user_other' },
      ]);
      const result = await service.listClients(adminAuth);
      expect(prisma.client.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual([
        { id: 'c1', name: 'Acme', isSelf: true },
        { id: 'c2', name: 'Northwind', isSelf: false },
      ]);
    });

    it('member sees only their accessible clients', async () => {
      prisma.client.findMany
        .mockResolvedValueOnce([{ id: 'client_owned' }]) // accessibleClientIds: owned
        .mockResolvedValueOnce([
          { id: 'client_owned', name: 'MemberCo', clerkUserId: 'user_member' },
        ]); // final findMany
      prisma.clientMembership.findMany.mockResolvedValue([]);
      const result = await service.listClients(memberAuth);
      expect(prisma.client.findMany).toHaveBeenNthCalledWith(2, {
        where: { id: { in: ['client_owned'] } },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual([
        { id: 'client_owned', name: 'MemberCo', isSelf: true },
      ]);
    });
  });

  describe('addMember', () => {
    it('allows an admin to add a member to any client', async () => {
      prisma.clientMembership.upsert.mockResolvedValue({
        id: 'm1',
        clerkUserId: 'user_new',
        clientId: 'client_x',
        role: 'member',
      });
      const result = await service.addMember(
        adminAuth,
        'client_x',
        'user_new',
      );
      expect(result.clientId).toBe('client_x');
      expect(prisma.clientMembership.upsert).toHaveBeenCalledWith({
        where: {
          clerkUserId_clientId: {
            clerkUserId: 'user_new',
            clientId: 'client_x',
          },
        },
        update: { role: 'member' },
        create: { clerkUserId: 'user_new', clientId: 'client_x', role: 'member' },
      });
    });

    it('forbids a member from adding a member to a client they do not own/admin', async () => {
      prisma.client.findMany.mockResolvedValue([]);
      prisma.clientMembership.findMany.mockResolvedValue([]);
      await expect(
        service.addMember(memberAuth, 'client_other', 'user_new'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('debtorsForClient', () => {
    it('returns only the requested client\'s debtors', async () => {
      prisma.debtor.findMany.mockResolvedValue([{ id: 'd1', clientId: 'client_a' }]);
      await service.debtorsForClient('client_a');
      expect(prisma.debtor.findMany).toHaveBeenCalledWith({
        where: { clientId: 'client_a' },
      });
    });
  });
});
