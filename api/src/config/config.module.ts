import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigController } from './config.controller';
import { TemplateService } from './template.service';
import { FlowService } from './flow.service';
import { ensureDefaults } from './seed-defaults';

@Module({
  controllers: [ConfigController],
  providers: [TemplateService, FlowService],
})
export class ConfigModule implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await ensureDefaults(this.prisma);
  }
}
