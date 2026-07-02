import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthContext } from '../auth/auth-context';
import { TenantService } from './tenant.service';

// Attaches the resolved tenant `client_id` to the request. Singleton scope on
// purpose: a global APP_INTERCEPTOR that injects a request-scoped provider fails
// to receive its constructor dependencies, so we store the id on the request
// object and read it back via the @ClientId() param decorator.
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantService: TenantService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<{ auth?: AuthContext; clientId?: string }>();
    if (request.auth) {
      request.clientId = await this.tenantService.resolveClientId(request.auth);
    }
    return next.handle();
  }
}
