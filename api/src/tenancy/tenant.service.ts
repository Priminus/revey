import { ForbiddenException, Injectable } from '@nestjs/common';
import { Debtor } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/auth-context';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveClientId(auth: AuthContext): Promise<string> {
    return this.resolveClientIdFor(auth, undefined);
  }

  async resolveClientIdFor(
    auth: AuthContext,
    requestedClientId?: string,
  ): Promise<string> {
    if (requestedClientId) {
      // MVP: any authenticated operator may access any client.
      // TODO: gate by membership/role
      const requested = await this.prisma.client.findUnique({
        where: { id: requestedClientId },
      });
      if (requested) {
        return requested.id;
      }
    }

    const client = await this.prisma.client.findUnique({
      where: { clerkUserId: auth.userId },
    });
    if (!client) {
      throw new ForbiddenException('User is not linked to a Revey client');
    }
    return client.id;
  }

  async listClients(): Promise<{ id: string; name: string }[]> {
    // MVP: all clients.
    // TODO: filter to the operator's accessible clients
    const clients = await this.prisma.client.findMany({
      orderBy: { name: 'asc' },
    });
    return clients.map((client) => ({ id: client.id, name: client.name }));
  }

  async debtorsForClient(clientId: string): Promise<Debtor[]> {
    return this.prisma.debtor.findMany({ where: { clientId } });
  }
}
