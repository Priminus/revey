import { ForbiddenException, Injectable } from '@nestjs/common';
import { Debtor } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/auth-context';
import { AdminService } from './admin.service';

export interface ClientSummary {
  id: string;
  name: string;
  isSelf: boolean;
}

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  /**
   * Returns the set of client ids a user may access: 'all' for Revey admins,
   * or the list of client ids the user owns or has been granted membership to.
   */
  async accessibleClientIds(userId: string): Promise<string[] | 'all'> {
    if (this.adminService.isAdmin(userId)) {
      return 'all';
    }
    const [owned, memberships] = await Promise.all([
      this.prisma.client.findMany({
        where: { clerkUserId: userId },
        select: { id: true },
      }),
      this.prisma.clientMembership.findMany({
        where: { clerkUserId: userId },
        select: { clientId: true },
      }),
    ]);
    const ids = new Set<string>();
    owned.forEach((client) => ids.add(client.id));
    memberships.forEach((membership) => ids.add(membership.clientId));
    return Array.from(ids);
  }

  async resolveClientId(auth: AuthContext): Promise<string> {
    return this.resolveClientIdFor(auth, undefined);
  }

  async resolveClientIdFor(
    auth: AuthContext,
    requestedClientId?: string,
  ): Promise<string> {
    const access = await this.accessibleClientIds(auth.userId);

    if (requestedClientId) {
      if (access === 'all') {
        const requested = await this.prisma.client.findFirst({
          where: { id: requestedClientId },
        });
        if (requested) {
          return requested.id;
        }
        // Admin requested a client that doesn't exist; fall through to default.
      } else if (access.includes(requestedClientId)) {
        return requestedClientId;
      } else {
        throw new ForbiddenException('No access to this client');
      }
    }

    if (access === 'all') {
      const owned = await this.prisma.client.findFirst({
        where: { clerkUserId: auth.userId },
      });
      if (owned) {
        return owned.id;
      }
      const first = await this.prisma.client.findFirst({
        orderBy: { name: 'asc' },
      });
      if (first) {
        return first.id;
      }
      throw new ForbiddenException('No clients exist');
    }

    if (access.length === 0) {
      throw new ForbiddenException('User is not linked to a Revey client');
    }
    return access[0];
  }

  async listClients(auth: AuthContext): Promise<ClientSummary[]> {
    const access = await this.accessibleClientIds(auth.userId);
    const clients = await this.prisma.client.findMany({
      where: access === 'all' ? undefined : { id: { in: access } },
      orderBy: { name: 'asc' },
    });
    return clients.map((client) => ({
      id: client.id,
      name: client.name,
      isSelf: client.clerkUserId === auth.userId,
    }));
  }

  async addMember(
    auth: AuthContext,
    clientId: string,
    clerkUserId: string,
    role = 'member',
  ): Promise<{
    id: string;
    clerkUserId: string;
    clientId: string;
    role: string;
  }> {
    const access = await this.accessibleClientIds(auth.userId);
    const hasAccess = access === 'all' || access.includes(clientId);
    if (!hasAccess) {
      throw new ForbiddenException('No access to this client');
    }
    return this.prisma.clientMembership.upsert({
      where: { clerkUserId_clientId: { clerkUserId, clientId } },
      update: { role },
      create: { clerkUserId, clientId, role },
    });
  }

  async debtorsForClient(clientId: string): Promise<Debtor[]> {
    return this.prisma.debtor.findMany({ where: { clientId } });
  }
}
