import { afterAll, beforeAll } from 'vitest';
import { closeBrowser } from '../../src/server/pdf/browser';
import { disconnectDb } from '../../src/server/db';
import { resetDb } from './helpers';

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeBrowser();
  await disconnectDb();
});
