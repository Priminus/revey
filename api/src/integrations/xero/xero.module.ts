import { Module } from '@nestjs/common';
import { XeroController } from './xero.controller';
import { XeroOAuthService } from './xero-oauth.service';
import { XeroConnectionService } from './xero-connection.service';
import { XeroApiService } from './xero-api.service';

@Module({
  controllers: [XeroController],
  providers: [
    { provide: XeroOAuthService, useFactory: () => new XeroOAuthService() },
    XeroConnectionService,
    XeroApiService,
  ],
  exports: [XeroOAuthService, XeroConnectionService, XeroApiService],
})
export class XeroModule {}
