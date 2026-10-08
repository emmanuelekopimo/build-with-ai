import type { NextFunction, Request, Response } from 'express';
import { can, PERMISSION_MESSAGE, type Permission } from '../../shared/permissions';
import { forbidden, HttpError, unauthorized } from '../lib/errors';
import { resolveSession, SESSION_COOKIE, toSessionUser, type SessionUser } from '../services/sessions';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
    sessionInfo?: { id: string; csrfToken: string; expiresAt: Date };
  }
}

/** Attaches req.user when a valid session cookie is present. Never rejects. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 0) {
      const s = await resolveSession(token);
      if (s) {
        req.user = toSessionUser(s.user);
        req.sessionInfo = { id: s.id, csrfToken: s.csrfToken, expiresAt: s.expiresAt };
      }
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized('Your session has ended. Please sign in again.'));
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized('Your session has ended. Please sign in again.'));
    if (!can(req.user.role, permission)) return next(forbidden(PERMISSION_MESSAGE[permission]));
    next();
  };
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF: every state-changing request must be JSON (forces a CORS preflight cross-site)
 * and, when authenticated, carry the per-session token in X-CSRF-Token.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) return next();
  const ct = req.headers['content-type'] ?? '';
  if (!ct.toString().startsWith('application/json')) {
    return next(new HttpError(415, 'Requests must be sent as JSON.'));
  }
  // Public signing/approval endpoints authenticate by single-use token, not session.
  if (req.sessionInfo && !req.path.startsWith('/public/')) {
    const header = req.headers['x-csrf-token'];
    if (typeof header !== 'string' || header !== req.sessionInfo.csrfToken) {
      return next(forbidden('Your session security token is missing or out of date. Refresh the page and try again.'));
    }
  }
  next();
}

export function currentUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
