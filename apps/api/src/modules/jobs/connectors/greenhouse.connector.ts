import { Inject, Injectable } from '@nestjs/common';
import { JOB_HTTP, type JobHttp } from './job-http.js';
import { htmlToText } from './text.js';
import { type BoardInfo, BoardNotFoundError, type BoardRef, type JobConnector, type NormalizedJob } from './types.js';
import { workplaceFromText } from './workplace.js';

/** Formato público da Job Board API (https://docs.greenhouse.io/job-board.html). */
interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string | null;
  language?: string | null;
  content?: string;
  location?: { name?: string | null } | null;
  departments?: Array<{ name: string }>;
}

const API = 'https://boards-api.greenhouse.io/v1/boards';

@Injectable()
export class GreenhouseConnector implements JobConnector {
  readonly provider = 'GREENHOUSE' as const;

  constructor(@Inject(JOB_HTTP) private readonly http: JobHttp) {}

  async board(ref: BoardRef): Promise<BoardInfo> {
    const b = await this.http.getJson<{ name?: string }>(`${API}/${encodeURIComponent(ref.boardToken)}`);
    if (!b) throw new BoardNotFoundError(ref);
    return {
      companyName: b.name?.trim() || ref.boardToken,
      careersUrl: `https://job-boards.greenhouse.io/${ref.boardToken}`,
    };
  }

  async jobs(ref: BoardRef): Promise<NormalizedJob[]> {
    const res = await this.http.getJson<{ jobs: GhJob[] }>(`${API}/${encodeURIComponent(ref.boardToken)}/jobs?content=true`);
    if (!res) throw new BoardNotFoundError(ref);
    return res.jobs.map((j) => {
      const location = j.location?.name?.trim();
      const description = htmlToText(j.content ?? '');
      return {
        externalId: String(j.id),
        title: j.title.trim(),
        department: j.departments?.[0]?.name ?? null,
        locations: location ? [location] : [],
        workplaceType: workplaceFromText(`${location ?? ''} ${j.title}`),
        employmentType: null,
        description,
        url: j.absolute_url,
        applyUrl: j.absolute_url,
        language: j.language ?? null,
        salary: null,
        publishedAt: j.first_published ? new Date(j.first_published) : j.updated_at ? new Date(j.updated_at) : null,
      };
    });
  }
}
