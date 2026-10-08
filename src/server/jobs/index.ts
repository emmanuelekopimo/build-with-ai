import { db } from '../db';
import { autoReminderJob, expireLinksJob, expiringSoonJob, overdueJob } from '../services/forms/manage';

export interface Job {
  name: string;
  schedule: string;
  run: () => Promise<unknown>;
}

export const JOBS: Job[] = [
  { name: 'expire-links', schedule: '*/5 * * * *', run: () => expireLinksJob() },
  { name: 'auto-reminders', schedule: '*/15 * * * *', run: () => autoReminderJob() },
  { name: 'link-expiring-soon', schedule: '7,22,37,52 * * * *', run: () => expiringSoonJob() },
  { name: 'overdue-returns', schedule: '11 * * * *', run: () => overdueJob() },
  {
    name: 'purge-expired-sessions',
    schedule: '17 * * * *',
    run: async () => {
      const now = new Date();
      await db().session.deleteMany({ where: { expiresAt: { lt: now } } });
      await db().passwordReset.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86400000) } } });
    },
  },
];
