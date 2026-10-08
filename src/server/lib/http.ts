import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { badRequest } from './errors';

export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

function issuesToFields(issues: z.ZodIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.join('.') || '_';
    if (!fields[key]) fields[key] = i.message;
  }
  return fields;
}

export function parse<S extends ZodTypeAny>(schema: S, value: unknown, what = 'request'): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const fields = issuesToFields(r.error.issues);
    const first = Object.entries(fields)[0];
    const msg = first ? (first[0] === '_' ? first[1] : `${first[1]}`) : `Invalid ${what}.`;
    throw badRequest(msg, { fields });
  }
  return r.data;
}

export function clientIp(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
}
