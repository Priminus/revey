import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { ScoringService } from './scoring.service';
import { DraftingService } from './drafting.service';
import { ApprovalsService } from './approvals.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ConfigModule],
  controllers: [AgentController],
  providers: [ScoringService, DraftingService, ApprovalsService],
})
export class AgentModule {}
