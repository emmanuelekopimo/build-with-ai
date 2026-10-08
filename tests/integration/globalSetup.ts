import { execSync } from 'node:child_process';

/** Apply committed migrations to the dedicated test database (non-destructive). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/itams_test';
  if (!/_(test|e2e)(\?|$)/.test(new URL(url).pathname + new URL(url).search)) {
    throw new Error(`Refusing to run integration tests against ${new URL(url).pathname}: database name must end in _test or _e2e.`);
  }
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
}
