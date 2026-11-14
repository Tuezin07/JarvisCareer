import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma.service.js';
import { StorageService } from '../../common/storage.service.js';
import { QUEUES } from '../../queues/queues.js';

/** Retenção limitada: capturas de tela expiradas são apagadas (arquivo e registro) uma vez por dia. */
@Processor(QUEUES.maintenance)
export class EvidenceCleanupProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(EvidenceCleanupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUES.maintenance) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('evidence-cleanup', { every: 24 * 3600 * 1000 }, { name: 'evidence.cleanup' });
  }

  async process() {
    const expired = await this.prisma.actionEvidence.findMany({ where: { expiresAt: { lt: new Date() } }, take: 500 });
    for (const e of expired) {
      await this.storage.delete(e.storageKey);
      await this.prisma.actionEvidence.delete({ where: { id: e.id } });
    }
    if (expired.length) this.logger.log(`${expired.length} evidência(s) expirada(s) removida(s)`);
    return { removed: expired.length };
  }
}
