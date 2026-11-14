export interface AutomationConfig {
  redisUrl: string;
  provider: 'local' | 'browserbase';
  headless: boolean;
  concurrency: number;
  allowLoopback: Set<string>;
  browserbaseApiKey: string | null;
  browserbaseProjectId: string | null;
}

export function loadConfig(): AutomationConfig {
  try {
    process.loadEnvFile('.env');
  } catch {
    // sem .env: variáveis vêm do ambiente
  }
  const provider = process.env.BROWSER_PROVIDER === 'browserbase' ? 'browserbase' : 'local';
  const browserbaseApiKey = process.env.BROWSERBASE_API_KEY?.trim() || null;
  if (provider === 'browserbase' && !browserbaseApiKey) {
    throw new Error('BROWSER_PROVIDER=browserbase exige BROWSERBASE_API_KEY no ambiente.');
  }
  return {
    redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6380',
    provider,
    headless: process.env.AUTOMATION_HEADLESS !== 'false',
    concurrency: Math.max(1, Math.min(4, Number(process.env.AUTOMATION_CONCURRENCY ?? 1))),
    allowLoopback: new Set(
      (process.env.AUTOMATION_ALLOW_LOOPBACK ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
    browserbaseApiKey,
    browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID?.trim() || null,
  };
}
