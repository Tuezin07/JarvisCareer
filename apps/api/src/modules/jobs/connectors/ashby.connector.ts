import { Inject, Injectable } from '@nestjs/common';
import { JOB_HTTP, type JobHttp } from './job-http.js';
import { titleCase } from './text.js';
import {
  type BoardInfo,
  BoardNotFoundError,
  type BoardRef,
  type JobConnector,
  type NormalizedJob,
  type NormalizedSalary,
} from './types.js';
import { workplaceFromProvider } from './workplace.js';

/** Formato público da Job Posting API (https://developers.ashbyhq.com/docs/public-job-posting-api). */
interface AshbyComponent {
  compensationType: string;
  interval?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
}

interface AshbyJob {
  id: string;
  title: string;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  location?: string | null;
  secondaryLocations?: Array<{ location: string }>;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string | null;
  descriptionPlain?: string;
  jobUrl: string;
  applyUrl?: string;
  publishedAt?: string;
  compensation?: { compensationTiers?: Array<{ components?: AshbyComponent[] }> } | null;
}

const PERIOD: Record<string, string> = { '1 YEAR': 'YEAR', '1 MONTH': 'MONTH', '1 HOUR': 'HOUR' };

function salaryOf(job: AshbyJob): NormalizedSalary | null {
  const salary = job.compensation?.compensationTiers
    ?.flatMap((t) => t.components ?? [])
    .find((c) => c.compensationType === 'Salary' && (c.minValue != null || c.maxValue != null));
  if (!salary) return null;
  return {
    min: salary.minValue ?? null,
    max: salary.maxValue ?? null,
    currency: salary.currencyCode ?? null,
    period: PERIOD[salary.interval ?? ''] ?? null,
  };
}

@Injectable()
export class AshbyConnector implements JobConnector {
  readonly provider = 'ASHBY' as const;

  constructor(@Inject(JOB_HTTP) private readonly http: JobHttp) {}

  private url(ref: BoardRef) {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.boardToken)}?includeCompensation=true`;
  }

  async board(ref: BoardRef): Promise<BoardInfo> {
    const res = await this.http.getJson<{ jobs: AshbyJob[] }>(this.url(ref));
    if (!res) throw new BoardNotFoundError(ref);
    return { companyName: titleCase(ref.boardToken), careersUrl: `https://jobs.ashbyhq.com/${ref.boardToken}` };
  }

  async jobs(ref: BoardRef): Promise<NormalizedJob[]> {
    const res = await this.http.getJson<{ jobs: AshbyJob[] }>(this.url(ref));
    if (!res) throw new BoardNotFoundError(ref);
    return res.jobs
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const locations = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter((l): l is string => !!l);
        const wp = workplaceFromProvider(j.workplaceType);
        return {
          externalId: j.id,
          title: j.title.trim(),
          department: j.department ?? j.team ?? null,
          locations,
          workplaceType: wp !== 'UNKNOWN' ? wp : j.isRemote ? 'REMOTE' : 'UNKNOWN',
          employmentType: j.employmentType ?? null,
          description: (j.descriptionPlain ?? '').trim(),
          url: j.jobUrl,
          applyUrl: j.applyUrl ?? j.jobUrl,
          language: null,
          salary: salaryOf(j),
          publishedAt: j.publishedAt ? new Date(j.publishedAt) : null,
        };
      });
  }
}
