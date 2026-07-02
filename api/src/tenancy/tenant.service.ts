import { ForbiddenException, Injectable } from '@nestjs/common';
import { Debtor } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/auth-context';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveClientId(auth: AuthContext): Promise<string> {
    if (!auth.clerkOrgId) {
      throw new ForbiddenException('No active organization');
    }
    const client = await this.prisma.client.findUnique({
      where: { clerkOrgId: auth.clerkOrgId },
    });
    if (!client) {
      throw new ForbiddenException('Organization is not a Revey client');
    }
    return client.id;
  }

  async debtorsForClient(clientId: string): Promise<Debtor[]> {
    return this.prisma.debtor.findMany({ where: { clientId } });
  }
}
