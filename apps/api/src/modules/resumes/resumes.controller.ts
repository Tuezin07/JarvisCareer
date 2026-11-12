import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { RESUME_MAX_BYTES, type ResumeDetailDto, type ResumeDto } from '@jarvis/shared';
import { requestMeta } from '../../common/audit.service.js';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { ResumesService } from './resumes.service.js';

@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumes: ResumesService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: RESUME_MAX_BYTES, files: 1, fields: 5 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<ResumeDto> {
    return this.resumes.upload(user.id, file, requestMeta(req));
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ResumeDto[]> {
    return this.resumes.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ResumeDetailDto> {
    return this.resumes.get(user.id, id);
  }

  @Post(':id/primary')
  @HttpCode(200)
  setPrimary(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ResumeDto> {
    return this.resumes.setPrimary(user.id, id);
  }

  @Post(':id/reprocess')
  @HttpCode(202)
  reprocess(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ResumeDto> {
    return this.resumes.reprocess(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.resumes.remove(user.id, id, requestMeta(req));
  }
}
