// node-cron scheduler; job bodies are registered in jobs/index.ts.
import cron, { type ScheduledTask } from 'node-cron';
import { db } from '../db';
import { logger } from '../lib/logger';
import { JOBS } from './index';

const tasks: ScheduledTask[] = [];

/** Run a job under a Postgres advisory lock so multiple instances never double-run it. */
export async function runLocked(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  const key = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  const rows = await db().$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_lock(${key}) AS locked`;
  if (!rows[0]?.locked) return false;
  try {
    await fn();
    return true;
  } catch (err) {
    logger().error({ job: name, err: (err as Error).message }, 'job failed');
    return false;
  } finally {
    await db().$queryRaw`SELECT pg_advisory_unlock(${key})`;
  }
}

export function startJobs(): void {
  for (const job of JOBS) {
    tasks.push(cron.schedule(job.schedule, () => void runLocked(job.name, job.run), { name: job.name }));
  }
  logger().info({ jobs: JOBS.map((j) => j.name) }, 'scheduler started');
}

export function stopJobs(): void {
  for (const t of tasks.splice(0)) void t.stop();
}
