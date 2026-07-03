import { Module } from '@nestjs/common';
import { ArController } from './ar.controller';
import { ArService } from './ar.service';
import { ArSyncService } from './ar-sync.service';
import { XeroModule } from '../integrations/xero/xero.module';

@Module({
  imports: [XeroModule],
  controllers: [ArController],
  providers: [ArService, ArSyncService],
  exports: [ArService],
})
export class ArModule {}
