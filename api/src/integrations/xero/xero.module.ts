import { Module } from '@nestjs/common';
import { XeroController } from './xero.controller';
import { XeroOAuthService } from './xero-oauth.service';
import { XeroConnectionService } from './xero-connection.service';
import { TenantModule } from '../../tenancy/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [XeroController],
  providers: [
    { provide: XeroOAuthService, useFactory: () => new XeroOAuthService() },
    XeroConnectionService,
  ],
  exports: [XeroOAuthService, XeroConnectionService],
})
export class XeroModule {}
