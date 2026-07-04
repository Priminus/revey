import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ClientId } from '../tenancy/client-id.decorator';
import { ScoringService, ScoreResult } from './scoring.service';
import { DraftingService } from './drafting.service';
import { ApprovalsService, DraftRow } from './approvals.service';

@Controller('agent')
export class AgentController {
  constructor(
    private readonly scoring: ScoringService,
    private readonly drafting: DraftingService,
    private readonly approvals: ApprovalsService,
  ) {}

  @Post('score')
  scoreAll(@ClientId() clientId: string): Promise<{ scored: number; failed: number }> {
    return this.scoring.scoreAllOpen(clientId);
  }

  @Post('score-all')
  scoreAllVendors(@ClientId() clientId: string): Promise<{ scored: number; failed: number }> {
    return this.scoring.scoreAll(clientId);
  }

  @Post('debtors/:id/score')
  scoreDebtor(
    @ClientId() clientId: string,
    @Param('id') id: string,
  ): Promise<ScoreResult> {
    return this.scoring.scoreDebtor(clientId, id);
  }

  @Post('debtors/:id/draft')
  draftForDebtor(
    @ClientId() clientId: string,
    @Param('id') id: string,
  ): Promise<{ id: string }> {
    return this.drafting.draftForDebtor(clientId, id);
  }

  @Post('debtors/:id/run')
  async run(
    @ClientId() clientId: string,
    @Param('id') id: string,
  ): Promise<
    | { draftId: string; autoSent: false }
    | { draftId: string; autoSent: true; result: { status: 'sent' | 'failed'; error?: string } }
  > {
    const { id: draftId, requireApproval } = await this.drafting.draftForDebtor(clientId, id);

    if (!requireApproval) {
      const result = await this.approvals.approveAndSend(clientId, draftId);
      return { draftId, autoSent: true, result };
    }

    return { draftId, autoSent: false };
  }

  @Get('drafts')
  listPending(@ClientId() clientId: string): Promise<DraftRow[]> {
    return this.approvals.listPending(clientId);
  }

  @Patch('drafts/:id')
  edit(
    @ClientId() clientId: string,
    @Param('id') id: string,
    @Body() patch: { subject?: string; body?: string },
  ): Promise<void> {
    return this.approvals.edit(clientId, id, patch);
  }

  @Post('drafts/:id/approve')
  approve(
    @ClientId() clientId: string,
    @Param('id') id: string,
  ): Promise<{ status: 'sent' | 'failed'; error?: string }> {
    return this.approvals.approveAndSend(clientId, id);
  }

  @Post('drafts/:id/reject')
  reject(@ClientId() clientId: string, @Param('id') id: string): Promise<void> {
    return this.approvals.reject(clientId, id);
  }
}
