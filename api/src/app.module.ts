import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClerkGuard } from './auth/clerk.guard';
import { TenantModule } from './tenancy/tenant.module';
import { TenantInterceptor } from './tenancy/tenant.interceptor';
import { CryptoModule } from './crypto/crypto.module';
import { XeroModule } from './integrations/xero/xero.module';
import { ArModule } from './ar/ar.module';
import { LlmModule } from './llm/llm.module';
import { MessagingModule } from './messaging/messaging.module';
import { AgentModule } from './agent/agent.module';
import { ConfigModule } from './config/config.module';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    AuthModule,
    TenantModule,
    CryptoModule,
    XeroModule,
    ArModule,
    LlmModule,
    MessagingModule,
    AgentModule,
    ConfigModule,
  ],
  providers: [
    { provide: APP_GUARD, useExisting: ClerkGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
