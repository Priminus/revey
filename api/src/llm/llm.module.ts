import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';

@Global()
@Module({
  providers: [{ provide: LlmService, useFactory: () => new LlmService() }],
  exports: [LlmService],
})
export class LlmModule {}
