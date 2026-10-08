import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import { env, isProd } from './env';
import { HttpError } from './lib/errors';
import { logger, redactUrl } from './lib/logger';
import { csrfProtection, loadSession } from './middleware/auth';
import { apiRouter } from './routes';

export function createApp() {
  const e = env();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', e.TRUST_PROXY ? 1 : false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'"],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: isProd() && e.APP_BASE_URL.startsWith('https') ? undefined : false,
    }),
  );

  // Strict CORS: same-origin by default; extra origins only when listed explicitly.
  const allowed = new Set(
    e.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });

  app.use(
    pinoHttp({
      logger: logger(),
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: redactUrl(req.url) }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  // Public signing / approval pages and their API must never be indexed.
  app.use(['/sign', '/approve', '/api/public', '/reset-password'], (_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api', loadSession, csrfProtection, apiRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // Production: serve the built client with SPA fallback.
  const clientDir = path.resolve('dist/client');
  if (isProd() && existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    if (err.status >= 500) logger().error({ err: err.message, url: redactUrl(req.url) }, 'request failed');
    return res.status(err.status).json({ error: err.message, ...(err.details ?? {}) });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request.' });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = String((err.meta as { target?: unknown })?.target ?? '');
      const message = /serial/i.test(target)
        ? 'An asset with this make/model and serial number already exists.'
        : /FormAsset/i.test(target) || /assetId/i.test(target)
          ? 'One of these assets is already on another active form.'
          : 'This record already exists.';
      return res.status(409).json({ error: message });
    }
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found.' });
  }
  const type = (err as { type?: string })?.type;
  if (type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });
  logger().error({ err: (err as Error)?.stack ?? String(err), url: redactUrl(req.url) }, 'unhandled error');
  if (process.env.ITAMS_DEBUG_ERRORS) console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. The error was logged; please try again.' });
}
