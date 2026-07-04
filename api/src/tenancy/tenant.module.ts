import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from './tenant.service';
import { ClientsController } from './clients.controller';
import { ensureSampleClients } from './seed-clients';

@Module({
  controllers: [ClientsController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await ensureSampleClients(this.prisma);
  }
}
