import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantContextService } from './tenant-context.service';

@Module({
  providers: [TenantService, TenantContextService],
  exports: [TenantService, TenantContextService],
})
export class TenantModule {}
