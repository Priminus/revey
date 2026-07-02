import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClerkGuard } from './auth/clerk.guard';
import { TenantModule } from './tenancy/tenant.module';
import { TenantInterceptor } from './tenancy/tenant.interceptor';

@Module({
  imports: [HealthModule, PrismaModule, AuthModule, TenantModule],
  providers: [
    { provide: APP_GUARD, useExisting: ClerkGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
