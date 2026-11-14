import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';
import {
  educationListSchema,
  experiencesSchema,
  matchWeightsInputSchema,
  type MatchWeightsInput,
  preferencesSchema,
  profileSchema,
  skillsSchema,
  type PreferencesInput,
  type ProfileInput,
} from '@jarvis/shared';
import { requestMeta } from '../../common/audit.service.js';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { ProfileService } from './profile.service.js';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profile.get(user.id);
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body({ schema: profileSchema }) body: ProfileInput, @Req() req: Request) {
    return this.profile.updateProfile(user.id, body, requestMeta(req));
  }

  @Put('preferences')
  preferences(
    @CurrentUser() user: AuthUser,
    @Body({ schema: preferencesSchema }) body: PreferencesInput,
    @Req() req: Request,
  ) {
    return this.profile.updatePreferences(user.id, body, requestMeta(req));
  }

  @Put('match-weights')
  matchWeights(
    @CurrentUser() user: AuthUser,
    @Body({ schema: matchWeightsInputSchema }) body: MatchWeightsInput,
    @Req() req: Request,
  ) {
    return this.profile.updateMatchWeights(user.id, body.weights, requestMeta(req));
  }

  @Put('experiences')
  experiences(
    @CurrentUser() user: AuthUser,
    @Body({ schema: experiencesSchema }) body: z.infer<typeof experiencesSchema>,
    @Req() req: Request,
  ) {
    return this.profile.replaceExperiences(user.id, body.items, requestMeta(req));
  }

  @Put('education')
  education(
    @CurrentUser() user: AuthUser,
    @Body({ schema: educationListSchema }) body: z.infer<typeof educationListSchema>,
    @Req() req: Request,
  ) {
    return this.profile.replaceEducation(user.id, body.items, requestMeta(req));
  }

  @Put('skills')
  skills(
    @CurrentUser() user: AuthUser,
    @Body({ schema: skillsSchema }) body: z.infer<typeof skillsSchema>,
    @Req() req: Request,
  ) {
    return this.profile.replaceSkills(user.id, body.items, requestMeta(req));
  }
}
