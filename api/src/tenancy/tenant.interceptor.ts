import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthContext } from '../auth/auth-context';
import { TenantService } from './tenant.service';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<{ auth?: AuthContext }>();
    if (request.auth) {
      const clientId = await this.tenantService.resolveClientId(request.auth);
      this.tenantContext.set(clientId);
    }
    return next.handle();
  }
}
