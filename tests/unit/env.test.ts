import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/server/env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  APP_BASE_URL: 'http://192.168.1.20:4000/',
  SESSION_SECRET: 'x'.repeat(40),
};

describe('env', () => {
  it('strips Windows carriage returns and trailing slashes', () => {
    const env = parseEnv({ ...base, DATABASE_URL: `${base.DATABASE_URL}\r`, APP_BASE_URL: 'http://192.168.1.20:4000/\r', PORT: '4100\r' });
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.APP_BASE_URL).toBe('http://192.168.1.20:4000');
    expect(env.PORT).toBe(4100);
    expect(env.HOST).toBe('0.0.0.0');
  });
  it('fails fast with a clear message on missing or malformed values', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL is required/);
    expect(() => parseEnv({ ...base, APP_BASE_URL: 'localhost' })).toThrow(/APP_BASE_URL must be an absolute URL/);
    expect(() => parseEnv({ ...base, SESSION_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() => parseEnv({ ...base, MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST is required/);
  });
});
