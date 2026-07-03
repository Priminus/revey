import { Controller, Get, Param, Post } from '@nestjs/common';
import { ClientId } from '../tenancy/client-id.decorator';
import { ArService, ArSummary, DebtorDetail, DebtorRow } from './ar.service';

@Controller('ar')
export class ArController {
  constructor(private readonly ar: ArService) {}

  @Post('sync')
  sync(@ClientId() clientId: string): Promise<{ debtors: number; invoices: number }> {
    return this.ar.syncFromXero(clientId);
  }

  @Get('summary')
  summary(@ClientId() clientId: string): Promise<ArSummary> {
    return this.ar.summary(clientId, new Date());
  }

  @Get('debtors')
  debtors(@ClientId() clientId: string): Promise<DebtorRow[]> {
    return this.ar.listDebtors(clientId, new Date());
  }

  @Get('debtors/:id')
  debtor(
    @ClientId() clientId: string,
    @Param('id') id: string,
  ): Promise<DebtorDetail> {
    return this.ar.getDebtor(clientId, id, new Date());
  }
}
