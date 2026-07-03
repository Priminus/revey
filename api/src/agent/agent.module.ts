import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { ScoringService } from './scoring.service';
import { DraftingService } from './drafting.service';
import { ApprovalsService } from './approvals.service';

@Module({
  controllers: [AgentController],
  providers: [ScoringService, DraftingService, ApprovalsService],
})
export class AgentModule {}
