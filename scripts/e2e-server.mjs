// Prepares the itams_e2e database (migrate, clear, seed) and starts the production build on :4100.
import { execSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const url = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/itams_e2e';
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: url,
  DIRECT_URL: url,
  PORT: '4100',
  HOST: '127.0.0.1',
  APP_BASE_URL: 'http://localhost:4100',
  SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-12345',
  COOKIE_SECURE: 'false',
  MAIL_TRANSPORT: 'file',
  MAIL_DIR: 'var/e2e-mail',
  JOBS_ENABLED: 'false',
  LOG_LEVEL: 'warn',
  SEED_PASSWORD: 'Itams-Demo-2026',
};
rmSync('var/e2e-mail', { recursive: true, force: true });
execSync('npx prisma migrate deploy', { env, stdio: 'inherit' });
execSync('npx tsx scripts/clear-db.ts', { env, stdio: 'inherit' });
execSync('npx tsx prisma/seed.ts', { env, stdio: 'inherit' });
const child = spawn('node', ['dist/server/index.js', '--production'], { env, stdio: 'inherit' });
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
