import { Injectable } from '@nestjs/common';
import type { JobProvider } from '@jarvis/shared';
import { AshbyConnector } from './ashby.connector.js';
import { GreenhouseConnector } from './greenhouse.connector.js';
import { LeverConnector } from './lever.connector.js';
import type { JobConnector } from './types.js';

/** Nível de integração de cada ATS (matriz em docs/research/matriz-plataformas.md). */
export const PROVIDER_LEVEL: Record<JobProvider, { read: 'API_OFICIAL'; submit: 'MANUAL' }> = {
  GREENHOUSE: { read: 'API_OFICIAL', submit: 'MANUAL' },
  LEVER: { read: 'API_OFICIAL', submit: 'MANUAL' },
  ASHBY: { read: 'API_OFICIAL', submit: 'MANUAL' },
};

@Injectable()
export class ConnectorRegistry {
  private readonly byProvider: Map<JobProvider, JobConnector>;

  constructor(greenhouse: GreenhouseConnector, lever: LeverConnector, ashby: AshbyConnector) {
    this.byProvider = new Map<JobProvider, JobConnector>([
      ['GREENHOUSE', greenhouse],
      ['LEVER', lever],
      ['ASHBY', ashby],
    ]);
  }

  get(provider: JobProvider): JobConnector {
    const c = this.byProvider.get(provider);
    if (!c) throw new Error(`Sem conector para ${provider}`);
    return c;
  }
}
