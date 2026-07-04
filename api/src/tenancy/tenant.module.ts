import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { ClientsController } from './clients.controller';

@Module({
  controllers: [ClientsController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
