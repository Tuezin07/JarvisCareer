import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from '../config/env.js';
import { AuditService } from './audit.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { StorageService } from './storage.service.js';

/** Infraestrutura compartilhada pelos dois entrypoints (HTTP e worker). */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: loadEnv },
    PrismaService,
    RedisService,
    StorageService,
    AuditService,
  ],
  exports: [ENV, PrismaService, RedisService, StorageService, AuditService],
})
export class CommonModule {}
