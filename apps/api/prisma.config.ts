import { defineConfig, env } from 'prisma/config';

// Prisma 7 não carrega .env sozinho; Node 22+ tem loadEnvFile nativo.
try {
  process.loadEnvFile('.env');
} catch {
  // Sem .env: as variáveis vêm do ambiente (CI, produção).
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
