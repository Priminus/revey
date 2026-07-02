import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [{ provide: EncryptionService, useFactory: () => new EncryptionService() }],
  exports: [EncryptionService],
})
export class CryptoModule {}
