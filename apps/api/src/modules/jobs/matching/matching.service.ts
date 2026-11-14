import { Injectable } from '@nestjs/common';
import { type Constraint, DEFAULT_MATCH_WEIGHTS, type MatchWeights, matchWeightsSchema } from '@jarvis/shared';
import { PrismaService } from '../../../common/prisma.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ActivityService } from '../../activity/activity.service.js';
import { type CandidateSnapshot, computeMatch } from './match-engine.js';

const GOOD_MATCH = 70;

/** Meses de experiência somando períodos sem contar sobreposição duas vezes. */
export function experienceMonths(periods: Array<{ startMonth: string; endMonth: string | null }>, now = new Date()): number {
  const toIndex = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    return y * 12 + (mo - 1);
  };
  const nowIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const ranges = periods
    .map((p) => [toIndex(p.startMonth), p.endMonth ? toIndex(p.endMonth) : nowIndex] as const)
    .filter(([a, b]) => b >= a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [a, b] of ranges) {
    if (a > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart + 1;
      curStart = a;
      curEnd = b;
    } else curEnd = Math.max(curEnd, b);
  }
  if (curEnd >= 0) total += curEnd - curStart + 1;
  return total;
}

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async snapshot(userId: string): Promise<{ candidate: CandidateSnapshot; weights: MatchWeights }> {
    const [profile, prefs, experiences, education, skills] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { userId } }),
      this.prisma.candidatePreferences.findUnique({ where: { userId } }),
      this.prisma.experience.findMany({ where: { userId, kind: { in: ['JOB', 'INTERNSHIP'] } } }),
      this.prisma.education.findMany({ where: { userId } }),
      this.prisma.candidateSkill.findMany({ where: { userId }, include: { skill: true } }),
    ]);
    const weights = matchWeightsSchema.safeParse(prefs?.matchWeights);
    return {
      weights: weights.success ? weights.data : DEFAULT_MATCH_WEIGHTS,
      candidate: {
        targetRoles: profile?.targetRoles ?? [],
        headline: profile?.headline ?? null,
        city: profile?.city ?? null,
        state: profile?.state ?? null,
        regionsOfInterest: profile?.regionsOfInterest ?? [],
        skills: skills.map((s) => s.skill.label),
        experienceMonths: experienceMonths(experiences),
        education: education.map((e) => ({ degree: e.degree, status: e.status })),
        workModes: prefs?.workModes ?? [],
        contractTypes: prefs?.contractTypes ?? [],
        schedules: prefs?.schedules ?? [],
        salaryExpectation: prefs?.salaryExpectation ?? null,
        acceptsNoExperience: prefs?.acceptsNoExperience ?? true,
        constraints: (prefs?.constraints as Constraint[] | undefined) ?? [],
      },
    };
  }

  /**
   * Recalcula a compatibilidade com todas as vagas abertas das empresas acompanhadas
   * (e das vagas importadas por link). Mantém o status que o candidato definiu.
   */
  async recomputeForUser(userId: string): Promise<{ total: number; newGood: number }> {
    const { candidate, weights } = await this.snapshot(userId);
    const listings = await this.prisma.jobListing.findMany({
      where: {
        closedAt: null,
        OR: [{ source: { followers: { some: { userId } } } }, { matches: { some: { userId } } }],
      },
      select: {
        id: true,
        title: true,
        department: true,
        locations: true,
        workplaceType: true,
        employmentType: true,
        description: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryPeriod: true,
        contentHash: true,
        companyName: true,
        matches: { where: { userId }, select: { id: true } },
      },
    });

    let newGood: Array<{ title: string; company: string; score: number }> = [];
    for (const l of listings) {
      const result = computeMatch(
        candidate,
        {
          title: l.title,
          department: l.department,
          locations: l.locations,
          workplaceType: l.workplaceType,
          employmentType: l.employmentType,
          description: l.description,
          salary: l.salaryMin != null || l.salaryMax != null ? { min: l.salaryMin, max: l.salaryMax, currency: l.salaryCurrency, period: l.salaryPeriod } : null,
        },
        weights,
      );
      const data = {
        score: result.score,
        eliminated: result.eliminated,
        breakdown: result.breakdown as unknown as Prisma.InputJsonValue,
        listingHash: l.contentHash,
        computedAt: new Date(),
      };
      if (l.matches.length) {
        await this.prisma.jobMatch.update({ where: { id: l.matches[0].id }, data });
      } else {
        await this.prisma.jobMatch.create({ data: { userId, listingId: l.id, ...data } });
        if (!result.eliminated && result.score >= GOOD_MATCH) newGood.push({ title: l.title, company: l.companyName, score: result.score });
      }
    }

    if (newGood.length) {
      newGood = newGood.sort((a, b) => b.score - a.score);
      await this.activity.record(userId, {
        type: 'jobs.new_matches',
        level: 'success',
        title: `Encontrei ${newGood.length} vaga(s) nova(s) com compatibilidade ≥ ${GOOD_MATCH}`,
        detail: newGood
          .slice(0, 3)
          .map((m) => `${m.title} · ${m.company} (${m.score})`)
          .join('; '),
      });
    }
    return { total: listings.length, newGood: newGood.length };
  }
}
