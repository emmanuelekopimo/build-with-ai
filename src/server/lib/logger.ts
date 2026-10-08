import pino from 'pino';
import { env } from '../env';

/** Remove single-use tokens from anything that might be logged. */
export function redactUrl(url: string): string {
  return url
    .replace(/\/(sign|approve|reset-password)\/[^/?#]+/g, '/$1/[redacted]')
    .replace(/([?&](token|t)=)[^&#]+/g, '$1[redacted]');
}

let instance: pino.Logger | null = null;

export function logger(): pino.Logger {
  if (!instance) {
    instance = pino({
      level: env().NODE_ENV === 'test' ? 'silent' : env().LOG_LEVEL,
      redact: {
        paths: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'password', 'token', '*.password', '*.token', '*.typedName'],
        censor: '[redacted]',
      },
    });
  }
  return instance;
}
