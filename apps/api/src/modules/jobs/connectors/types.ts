import type { JobProvider, WorkplaceType } from '@jarvis/shared';

export interface NormalizedSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  /** YEAR, MONTH ou HOUR */
  period: string | null;
}

/** Vaga no formato comum, independente do ATS de origem. */
export interface NormalizedJob {
  externalId: string;
  title: string;
  department: string | null;
  locations: string[];
  workplaceType: WorkplaceType;
  employmentType: string | null;
  description: string;
  url: string;
  applyUrl: string | null;
  language: string | null;
  salary: NormalizedSalary | null;
  publishedAt: Date | null;
}

export interface BoardRef {
  provider: JobProvider;
  boardToken: string;
  region: string | null;
}

export interface BoardInfo {
  companyName: string;
  careersUrl: string;
}

/**
 * Conector de leitura de um ATS. Usa apenas APIs públicas documentadas de listagem
 * de vagas; nenhum conector envia candidaturas (ver docs/research/matriz-plataformas.md).
 */
export interface JobConnector {
  readonly provider: JobProvider;
  /** Confirma que a página existe e devolve o nome da empresa. */
  board(ref: BoardRef): Promise<BoardInfo>;
  /** Todas as vagas abertas publicadas na página. */
  jobs(ref: BoardRef): Promise<NormalizedJob[]>;
}

export class BoardNotFoundError extends Error {
  constructor(ref: BoardRef) {
    super(`Página de vagas não encontrada: ${ref.provider} "${ref.boardToken}"`);
  }
}
