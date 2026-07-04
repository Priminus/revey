import { Controller, Get } from '@nestjs/common';
import { TenantService } from './tenant.service';

@Controller('clients')
export class ClientsController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  list(): Promise<{ id: string; name: string }[]> {
    return this.tenantService.listClients();
  }
}
