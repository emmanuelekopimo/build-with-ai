export interface Job {
  name: string;
  schedule: string;
  run: () => Promise<unknown>;
}

export const JOBS: Job[] = [
  {
    name: 'purge-expired-sessions',
    schedule: '17 * * * *',
    run: async () => {
      const { db } = await import('../db');
      const now = new Date();
      await db().session.deleteMany({ where: { expiresAt: { lt: now } } });
      await db().passwordReset.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86400000) } } });
    },
  },
];
