import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  private _clientId: string | null = null;

  set(clientId: string): void {
    this._clientId = clientId;
  }

  get clientId(): string {
    if (!this._clientId) {
      throw new Error('Tenant context not set for this request');
    }
    return this._clientId;
  }
}
