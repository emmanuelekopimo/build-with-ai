// Environment loading and validation. Fails fast with a clear message.
// Values are trimmed of Windows carriage returns (\r) before validation.

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required (pooled connection string on Neon)' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must start with postgresql://'),
  DIRECT_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DIRECT_URL must start with postgresql://')
    .optional(),
  APP_BASE_URL: z
    .string({ required_error: 'APP_BASE_URL is required (used to build links in emails)' })
    .url('APP_BASE_URL must be an absolute URL such as http://192.168.1.20:4000')
    .transform((v) => v.replace(/\/+$/, '')),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  COOKIE_SECURE: bool.optional(),
  TRUST_PROXY: bool.default('false'),
  CORS_ORIGINS: z.string().default(''),
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(8),

  MAIL_TRANSPORT: z.enum(['smtp', 'file', 'memory']).default('file'),
  MAIL_DIR: z.string().default('var/mail'),
  MAIL_FROM: z.string().default('ECEWS IT Department <it@ecews.org>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: bool.default('false'),
  IT_CONTACT_EMAIL: z.string().email().default('it@ecews.org'),

  CHROMIUM_PATH: z.string().optional(),
  JOBS_ENABLED: bool.default('true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ENABLE_DEV_ROUTES: bool.default('false'),
});

export type Env = z.infer<typeof schema>;

/** Strip \r (and surrounding whitespace) from every env value, in place. */
export function cleanProcessEnv(source: NodeJS.ProcessEnv = process.env): void {
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'string' && /[\r]|^\s|\s$/.test(v)) source[k] = v.replace(/\r/g, '').trim();
  }
}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'string') {
      const cleaned = v.replace(/\r/g, '').trim();
      if (cleaned !== '') raw[k] = cleaned;
    }
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example.`);
  }
  const env = result.data;
  if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
    throw new Error('Invalid environment configuration:\n  - SMTP_HOST is required when MAIL_TRANSPORT=smtp');
  }
  return env;
}

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    if (process.env.NODE_ENV !== 'test') loadDotenv({ quiet: true } as Parameters<typeof loadDotenv>[0]);
    cleanProcessEnv();
    cached = parseEnv(process.env);
  }
  return cached;
}

export function isProd(): boolean {
  return env().NODE_ENV === 'production';
}
