// node-cron scheduler; job bodies are registered in jobs/index.ts.
import cron, { type ScheduledTask } from 'node-cron';
import { db } from '../db';
import { logger } from '../lib/logger';
import { JOBS } from './index';

const tasks: ScheduledTask[] = [];

/**
 * Run a job under a transaction-scoped Postgres advisory lock so multiple instances never double-run it.
 * The lock lives on one pinned connection for the job's duration, which also works behind
 * transaction-mode poolers such as Neon's pgbouncer (session-level locks would not).
 */
export async function runLocked(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  const key = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  try {
    return await db().$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${key}) AS locked`;
        if (!rows[0]?.locked) return false;
        await fn();
        return true;
      },
      { timeout: 10 * 60 * 1000, maxWait: 10000 },
    );
  } catch (err) {
    logger().error({ job: name, err: (err as Error).message }, 'job failed');
    return false;
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
