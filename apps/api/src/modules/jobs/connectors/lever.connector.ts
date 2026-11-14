import { Inject, Injectable } from '@nestjs/common';
import { JOB_HTTP, type JobHttp } from './job-http.js';
import { htmlToText, titleCase } from './text.js';
import { type BoardInfo, BoardNotFoundError, type BoardRef, type JobConnector, type NormalizedJob } from './types.js';
import { workplaceFromProvider, workplaceFromText } from './workplace.js';

/** Formato público da Postings API (https://github.com/lever/postings-api). */
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  country?: string | null;
  workplaceType?: string | null;
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: Array<{ text: string; content: string }>;
  categories?: { commitment?: string; department?: string; team?: string; location?: string; allLocations?: string[] };
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string } | null;
}

const PERIOD: Record<string, string> = { 'per-year-salary': 'YEAR', 'per-month-salary': 'MONTH', 'per-hour-wage': 'HOUR' };

@Injectable()
export class LeverConnector implements JobConnector {
  readonly provider = 'LEVER' as const;

  constructor(@Inject(JOB_HTTP) private readonly http: JobHttp) {}

  private base(ref: BoardRef) {
    return ref.region === 'eu' ? 'https://api.eu.lever.co/v0/postings' : 'https://api.lever.co/v0/postings';
  }

  async board(ref: BoardRef): Promise<BoardInfo> {
    // A API não expõe o nome da empresa; uma listagem vazia ainda confirma que o site existe.
    const res = await this.http.getJson<LeverPosting[]>(`${this.base(ref)}/${encodeURIComponent(ref.boardToken)}?mode=json&limit=1`);
    if (!res) throw new BoardNotFoundError(ref);
    const host = ref.region === 'eu' ? 'jobs.eu.lever.co' : 'jobs.lever.co';
    return { companyName: titleCase(ref.boardToken), careersUrl: `https://${host}/${ref.boardToken}` };
  }

  async jobs(ref: BoardRef): Promise<NormalizedJob[]> {
    const res = await this.http.getJson<LeverPosting[]>(`${this.base(ref)}/${encodeURIComponent(ref.boardToken)}?mode=json`);
    if (!res) throw new BoardNotFoundError(ref);
    return res.map((p) => {
      const c = p.categories ?? {};
      const locations = c.allLocations?.length ? c.allLocations : c.location ? [c.location] : [];
      const lists = (p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n\n');
      const description = [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join('\n\n').trim();
      const wp = workplaceFromProvider(p.workplaceType);
      return {
        externalId: p.id,
        title: p.text.trim(),
        department: c.department ?? c.team ?? null,
        locations,
        workplaceType: wp !== 'UNKNOWN' ? wp : workplaceFromText(locations.join(' ')),
        employmentType: c.commitment ?? null,
        description,
        url: p.hostedUrl,
        applyUrl: p.applyUrl ?? p.hostedUrl,
        language: null,
        salary: p.salaryRange
          ? {
              min: p.salaryRange.min ?? null,
              max: p.salaryRange.max ?? null,
              currency: p.salaryRange.currency ?? null,
              period: PERIOD[p.salaryRange.interval ?? ''] ?? null,
            }
          : null,
        publishedAt: p.createdAt ? new Date(p.createdAt) : null,
      };
    });
  }
}
