import { defineConfig } from 'vitest/config';

const testDb = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/itams_test';

export default defineConfig({
  test: {
    // Integration files share one database, so files run one at a time.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/globalSetup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          testTimeout: 30000,
          hookTimeout: 60000,
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: testDb,
            DIRECT_URL: testDb,
            APP_BASE_URL: 'http://itams.test',
            SESSION_SECRET: 'test-secret-test-secret-test-secret-1234',
            MAIL_TRANSPORT: 'memory',
            JOBS_ENABLED: 'false',
            LOG_LEVEL: 'silent',
          },
        },
      },
    ],
  },
});
