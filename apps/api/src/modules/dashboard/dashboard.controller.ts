import { Controller, Get } from '@nestjs/common';
import { computeProfileCompleteness, type DashboardSummary } from '@jarvis/shared';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Números reais do banco. O que ainda não existe volta null — nunca zero inventado. */
  @Get('summary')
  async summary(@CurrentUser() user: AuthUser): Promise<DashboardSummary> {
    const userId = user.id;
    const [profile, prefs, expCount, eduCount, skillCount, byStatus, events24h, jobsFound] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { userId } }),
      this.prisma.candidatePreferences.findUnique({ where: { userId }, select: { userId: true } }),
      this.prisma.experience.count({ where: { userId } }),
      this.prisma.education.count({ where: { userId } }),
      this.prisma.candidateSkill.count({ where: { userId } }),
      this.prisma.resume.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } }),
      this.activity.countSince(userId, new Date(Date.now() - 24 * 3600 * 1000)),
      this.prisma.jobMatch.count({ where: { userId, eliminated: false, status: { not: 'DISMISSED' }, listing: { closedAt: null } } }),
    ]);

    const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const totalResumes = byStatus.reduce((acc, r) => acc + r._count._all, 0);

    return {
      profileCompleteness: computeProfileCompleteness({
        fullName: profile?.fullName,
        phone: profile?.phone,
        city: profile?.city,
        state: profile?.state,
        headline: profile?.headline,
        targetRoles: profile?.targetRoles,
        hasPreferences: !!prefs,
        experienceCount: expCount,
        educationCount: eduCount,
        skillCount,
        resumeCount: totalResumes,
      }),
      resumes: {
        total: totalResumes,
        extracted: count('EXTRACTED'),
        processing: count('UPLOADED') + count('PROCESSING'),
        failed: count('FAILED'),
      },
      events24h,
      applications: null,
      jobsFound,
    };
  }
}
