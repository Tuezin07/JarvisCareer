import { Module } from '@nestjs/common';
import { JobsQueueModule } from '../jobs/jobs-queue.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [JobsQueueModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
