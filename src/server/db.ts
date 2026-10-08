import { PrismaClient, Prisma } from '@prisma/client';
import { env } from './env';

export type Tx = Prisma.TransactionClient;

let client: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!client) {
    env(); // validate + clean env before Prisma reads DATABASE_URL
    client = new PrismaClient();
  }
  return client;
}

/** Serializable-enough transaction with retries on serialization / deadlock failures. */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>, opts: { timeoutMs?: number } = {}): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await db().$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: opts.timeoutMs ?? 20000,
        maxWait: 10000,
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      const dbCode = (err as { meta?: { code?: string } }).meta?.code;
      const retryable = code === 'P2034' || code === '40P01' || dbCode === '40P01' || dbCode === '40001';
      if (retryable && attempt < 3) {
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

export async function disconnectDb(): Promise<void> {
  if (client) await client.$disconnect();
  client = null;
}
