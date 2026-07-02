import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({ imports: [HealthModule, PrismaModule, AuthModule] })
export class AppModule {}
