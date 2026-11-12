import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import type { ResumeDetailDto, ResumeDto, ResumeKind } from '@jarvis/shared';
import { AuditService, type RequestMeta } from '../../common/audit.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { StorageService } from '../../common/storage.service.js';
import type { Resume } from '../../generated/prisma/client.js';
import { QUEUES, type ResumeExtractJob, resumeExtractJobId } from '../../queues/queues.js';
import { ActivityService } from '../activity/activity.service.js';
import { TasksService } from '../activity/tasks.service.js';
import { detectResumeKind, sanitizeFileName } from './file-signature.js';

export function toResumeDto(r: Resume): ResumeDto {
  return {
    id: r.id,
    originalName: r.originalName,
    kind: r.kind as ResumeKind,
    sizeBytes: r.sizeBytes,
    sha256: r.sha256,
    status: r.status,
    isPrimary: r.isPrimary,
    pageCount: r.pageCount,
    charCount: r.charCount,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt.toISOString(),
    extractedAt: r.extractedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ResumesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly tasks: TasksService,
    @InjectQueue(QUEUES.resume) private readonly queue: Queue<ResumeExtractJob>,
  ) {}

  async upload(
    userId: string,
    file: { buffer: Buffer; originalname: string } | undefined,
    meta: RequestMeta,
  ): Promise<ResumeDto> {
    if (!file?.buffer?.length) throw new BadRequestException('Envie o arquivo no campo "file"');

    const signature = detectResumeKind(file.buffer);
    if (!signature.ok) throw new UnsupportedMediaTypeException(signature.reason);

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.resume.findUnique({ where: { userId_sha256: { userId, sha256 } } });
    if (duplicate) throw new ConflictException('Este mesmo arquivo já foi enviado');

    const id = randomUUID();
    const storageKey = `users/${userId}/resumes/${id}.${signature.kind}`;
    await this.storage.put(storageKey, file.buffer);

    const isFirst = (await this.prisma.resume.count({ where: { userId } })) === 0;
    const resume = await this.prisma.resume.create({
      data: {
        id,
        userId,
        originalName: sanitizeFileName(file.originalname),
        kind: signature.kind,
        mimeType: signature.mimeType,
        sizeBytes: file.buffer.length,
        sha256,
        storageKey,
        isPrimary: isFirst,
      },
    });

    await this.audit.log('resume.upload', {
      userId,
      meta,
      metadata: { resumeId: id, kind: signature.kind, sizeBytes: file.buffer.length },
    });
    await this.activity.record(userId, {
      type: 'resume.uploaded',
      title: `Currículo recebido: ${resume.originalName}`,
      detail: 'Leitura do documento enfileirada.',
      subject: `resume:${id}`,
    });
    await this.enqueueExtraction(userId, id, 0);
    return toResumeDto(resume);
  }

  async list(userId: string): Promise<ResumeDto[]> {
    const rows = await this.prisma.resume.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map(toResumeDto);
  }

  async get(userId: string, id: string): Promise<ResumeDetailDto> {
    const r = await this.findOwned(userId, id);
    return { ...toResumeDto(r), extractedText: r.extractedText };
  }

  async setPrimary(userId: string, id: string): Promise<ResumeDto> {
    await this.findOwned(userId, id);
    const [, updated] = await this.prisma.$transaction([
      this.prisma.resume.updateMany({ where: { userId, isPrimary: true }, data: { isPrimary: false } }),
      this.prisma.resume.update({ where: { id }, data: { isPrimary: true } }),
    ]);
    return toResumeDto(updated);
  }

  async reprocess(userId: string, id: string): Promise<ResumeDto> {
    const r = await this.findOwned(userId, id);
    if (r.status !== 'FAILED') throw new ConflictException('Só currículos com falha podem ser reprocessados');
    const updated = await this.prisma.resume.update({
      where: { id },
      data: { status: 'UPLOADED', errorMessage: null, attempts: { increment: 1 } },
    });
    await this.enqueueExtraction(userId, id, updated.attempts);
    return toResumeDto(updated);
  }

  async remove(userId: string, id: string, meta: RequestMeta): Promise<void> {
    const r = await this.findOwned(userId, id);
    await this.prisma.resume.delete({ where: { id } });
    await this.storage.delete(r.storageKey);
    if (r.isPrimary) {
      const next = await this.prisma.resume.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      if (next) await this.prisma.resume.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await this.audit.log('resume.delete', { userId, meta, metadata: { resumeId: id } });
  }

  /** Busca sempre restrita ao dono: id de outro candidato responde 404, não 403. */
  private async findOwned(userId: string, id: string): Promise<Resume> {
    const r = await this.prisma.resume.findFirst({ where: { id, userId } });
    if (!r) throw new NotFoundException('Currículo não encontrado');
    return r;
  }

  private async enqueueExtraction(userId: string, resumeId: string, run: number) {
    const jobId = resumeExtractJobId(resumeId, run);
    const task = await this.tasks.create(userId, 'resume.extract', jobId);
    await this.queue.add('extract', { userId, resumeId, taskId: task.id }, { jobId });
  }
}
