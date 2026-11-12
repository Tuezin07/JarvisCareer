import { Injectable } from '@nestjs/common';
import type {
  Constraint,
  EducationInput,
  ExperienceInput,
  PreferencesInput,
  ProfileInput,
  SkillInput,
} from '@jarvis/shared';
import { AuditService, type RequestMeta } from '../../common/audit.service.js';
import { PrismaService } from '../../common/prisma.service.js';

const normalizeSkill = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(userId: string) {
    const [profile, preferences, experiences, education, skills] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { userId } }),
      this.prisma.candidatePreferences.findUnique({ where: { userId } }),
      this.prisma.experience.findMany({ where: { userId }, orderBy: { position: 'asc' } }),
      this.prisma.education.findMany({ where: { userId }, orderBy: { position: 'asc' } }),
      this.prisma.candidateSkill.findMany({ where: { userId }, include: { skill: true } }),
    ]);

    return {
      profile: profile && {
        fullName: profile.fullName,
        phone: profile.phone,
        city: profile.city,
        state: profile.state,
        headline: profile.headline,
        summary: profile.summary,
        targetRoles: profile.targetRoles,
        regionsOfInterest: profile.regionsOfInterest,
        availability: profile.availability,
        updatedAt: profile.updatedAt.toISOString(),
      },
      preferences: preferences && {
        workModes: preferences.workModes,
        contractTypes: preferences.contractTypes,
        schedules: preferences.schedules,
        salaryExpectation: preferences.salaryExpectation,
        firstJob: preferences.firstJob,
        acceptsNoExperience: preferences.acceptsNoExperience,
        constraints: preferences.constraints as Constraint[],
        searchPaused: preferences.searchPaused,
      },
      experiences: experiences.map(({ userId: _u, position: _p, ...e }) => e),
      education: education.map(({ userId: _u, position: _p, ...e }) => e),
      skills: skills.map((s) => ({ name: s.skill.label, kind: s.skill.kind, level: s.level, source: s.source })),
    };
  }

  async updateProfile(userId: string, input: ProfileInput, meta: RequestMeta) {
    const data = {
      fullName: input.fullName,
      phone: input.phone ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      headline: input.headline ?? null,
      summary: input.summary ?? null,
      targetRoles: input.targetRoles,
      regionsOfInterest: input.regionsOfInterest,
      availability: input.availability ?? null,
    };
    await this.prisma.candidateProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    await this.audit.log('profile.update', { userId, meta });
    return this.get(userId);
  }

  async updatePreferences(userId: string, input: PreferencesInput, meta: RequestMeta) {
    const data = {
      workModes: input.workModes,
      contractTypes: input.contractTypes,
      schedules: input.schedules,
      salaryExpectation: input.salaryExpectation ?? null,
      firstJob: input.firstJob,
      acceptsNoExperience: input.acceptsNoExperience,
      constraints: input.constraints,
    };
    await this.prisma.candidatePreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    await this.audit.log('preferences.update', { userId, meta });
    return this.get(userId);
  }

  async replaceExperiences(userId: string, items: ExperienceInput[], meta: RequestMeta) {
    await this.prisma.$transaction([
      this.prisma.experience.deleteMany({ where: { userId } }),
      this.prisma.experience.createMany({
        data: items.map((e, position) => ({
          userId,
          position,
          company: e.company,
          title: e.title,
          kind: e.kind,
          location: e.location ?? null,
          startMonth: e.startMonth,
          endMonth: e.endMonth ?? null,
          description: e.description ?? null,
        })),
      }),
    ]);
    await this.audit.log('profile.experiences.update', { userId, meta, metadata: { count: items.length } });
    return this.get(userId);
  }

  async replaceEducation(userId: string, items: EducationInput[], meta: RequestMeta) {
    await this.prisma.$transaction([
      this.prisma.education.deleteMany({ where: { userId } }),
      this.prisma.education.createMany({
        data: items.map((e, position) => ({
          userId,
          position,
          institution: e.institution,
          degree: e.degree,
          field: e.field ?? null,
          status: e.status,
          startMonth: e.startMonth ?? null,
          endMonth: e.endMonth ?? null,
        })),
      }),
    ]);
    await this.audit.log('profile.education.update', { userId, meta, metadata: { count: items.length } });
    return this.get(userId);
  }

  async replaceSkills(userId: string, items: SkillInput[], meta: RequestMeta) {
    const unique = new Map(items.map((s) => [normalizeSkill(s.name), s]));
    await this.prisma.$transaction(async (tx) => {
      await tx.candidateSkill.deleteMany({ where: { userId } });
      for (const [normalized, s] of unique) {
        const skill = await tx.skill.upsert({
          where: { normalized },
          create: { normalized, label: s.name.trim(), kind: s.kind },
          update: {},
        });
        await tx.candidateSkill.create({
          data: { userId, skillId: skill.id, level: s.level ?? null, source: 'MANUAL' },
        });
      }
    });
    await this.audit.log('profile.skills.update', { userId, meta, metadata: { count: unique.size } });
    return this.get(userId);
  }
}
