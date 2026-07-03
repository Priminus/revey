import { Global, Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';

@Global()
@Module({
  providers: [{ provide: MessagingService, useFactory: () => new MessagingService() }],
  exports: [MessagingService],
})
export class MessagingModule {}
