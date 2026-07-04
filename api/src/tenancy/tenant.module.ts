import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { AdminService } from './admin.service';
import { ClientsController } from './clients.controller';

@Module({
  controllers: [ClientsController],
  providers: [TenantService, AdminService],
  exports: [TenantService, AdminService],
})
export class TenantModule {}
