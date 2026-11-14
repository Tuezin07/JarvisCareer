import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { CommonModule } from './common/common.module.js';
import { ENV, type Env } from './config/env.js';
import { ActivityModule } from './modules/activity/activity.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BrowserModule } from './modules/browser/browser.module.js';
import { DashboardController } from './modules/dashboard/dashboard.controller.js';
import { HealthController } from './modules/health/health.controller.js';
import { IntelligenceModule } from './modules/intelligence/intelligence.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { PrivacyController } from './modules/privacy/privacy.controller.js';
import { PrivacyService } from './modules/privacy/privacy.service.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { ResumesModule } from './modules/resumes/resumes.module.js';

/** Fila compartilhada pelos dois entrypoints, com prefixo próprio no Redis. */
export const bullRoot = BullModule.forRootAsync({
  inject: [ENV],
  useFactory: (env: Env) => ({ connection: { url: env.REDIS_URL }, prefix: 'jarvis' }),
});

/** Control plane HTTP. Não registra processadores de fila: isso é papel do worker. */
@Module({
  imports: [
    CommonModule,
    bullRoot,
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, algorithm: 'HS256' },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        // Os e2e criam muitas contas por segundo do mesmo IP.
        skipIf: () => env.NODE_ENV === 'test',
      }),
    }),
    AuthModule,
    ActivityModule,
    ProfileModule,
    ResumesModule,
    IntelligenceModule,
    JobsModule,
    BrowserModule,
  ],
  controllers: [HealthController, DashboardController, PrivacyController],
  providers: [
    PrivacyService,
    // Ordem importa: limite de taxa antes da autenticação.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
