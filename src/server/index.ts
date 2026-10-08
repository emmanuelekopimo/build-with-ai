import { createApp } from './app';
import { disconnectDb } from './db';
import { env } from './env';
import { startJobs, stopJobs } from './jobs/scheduler';
import { logger } from './lib/logger';
import { closeBrowser } from './pdf/browser';

function main() {
  let e;
  try {
    e = env();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const app = createApp();
  const server = app.listen(e.PORT, e.HOST, () => {
    logger().info(`ECEWS-ITAMS listening on http://${e.HOST}:${e.PORT} (links use ${e.APP_BASE_URL})`);
  });
  if (e.JOBS_ENABLED) startJobs();
  const shutdown = async () => {
    stopJobs();
    server.close();
    await closeBrowser();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
