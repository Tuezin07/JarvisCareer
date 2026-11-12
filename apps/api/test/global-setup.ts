import { execSync } from 'node:child_process';

/**
 * Aplica migrações pendentes no banco de teste. Nada é apagado: cada teste cria
 * candidatos com e-mail único, e jobs/arquivos usam ids aleatórios, então execuções
 * repetidas não colidem.
 */
export default function setup() {
  process.loadEnvFile('.env.test');
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('jarvis_test')) {
    throw new Error(`Recusando rodar e2e fora do banco jarvis_test: ${url}`);
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
