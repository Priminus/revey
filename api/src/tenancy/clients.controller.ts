import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import type { AuthContext } from '../auth/auth-context';
import { TenantService } from './tenant.service';
import type { ClientSummary } from './tenant.service';
import type { AddMemberDto } from './dto/add-member.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  list(@Auth() auth: AuthContext): Promise<ClientSummary[]> {
    return this.tenantService.listClients(auth);
  }

  @Post(':id/members')
  addMember(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ): Promise<{
    id: string;
    clerkUserId: string;
    clientId: string;
    role: string;
  }> {
    if (!dto?.clerkUserId) {
      throw new BadRequestException('clerkUserId is required');
    }
    return this.tenantService.addMember(auth, id, dto.clerkUserId, dto.role);
  }
}
