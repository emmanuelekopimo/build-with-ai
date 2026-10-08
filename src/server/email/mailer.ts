// Nodemailer wrapper. Transports: smtp (production / Mailpit), file (dev: .eml + .json
// under MAIL_DIR so every email can be inspected), memory (tests).

import nodemailer, { type Transporter } from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env';
import { logger } from '../lib/logger';

export interface OutgoingMail {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

export interface SentMail extends OutgoingMail {
  sentAt: Date;
}

const outbox: SentMail[] = [];
export const getOutbox = (): SentMail[] => outbox;
export const clearOutbox = (): void => {
  outbox.length = 0;
};

let transporter: Transporter | null = null;
function smtp(): Transporter {
  if (!transporter) {
    const e = env();
    transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 587,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS ?? '' } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(mail: OutgoingMail): Promise<void> {
  const e = env();
  const to = Array.isArray(mail.to) ? mail.to.join(', ') : mail.to;
  if (e.MAIL_TRANSPORT === 'memory') {
    outbox.push({ ...mail, sentAt: new Date() });
    return;
  }
  const message = {
    from: e.MAIL_FROM,
    to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: mail.attachments,
  };
  if (e.MAIL_TRANSPORT === 'smtp') {
    await smtp().sendMail(message);
  } else {
    const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    const info = await stream.sendMail(message);
    const dir = path.resolve(e.MAIL_DIR);
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safe = mail.subject.replace(/[^A-Za-z0-9-]+/g, '_').slice(0, 60);
    await writeFile(path.join(dir, `${stamp}_${safe}.eml`), info.message as Buffer);
  }
  logger().info({ to, subject: mail.subject }, 'email sent');
}

/** Send and report failure instead of throwing (used after a DB commit). */
export async function trySendMail(mail: OutgoingMail): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sendMail(mail);
    return { ok: true };
  } catch (err) {
    logger().error({ err: (err as Error).message, subject: mail.subject }, 'email failed');
    return { ok: false, error: (err as Error).message };
  }
}
