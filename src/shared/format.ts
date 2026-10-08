// Display formatting: dates like "14 Aug 2026", times in WAT (Africa/Lagos), NGN currency.

import { TIMEZONE } from './constants';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TIMEZONE });
const dayMonthFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: TIMEZONE });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE });
const longDateFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIMEZONE,
});
const isoDateFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TIMEZONE });

type DateInput = Date | string | number | null | undefined;
const toDate = (d: DateInput): Date | null => (d === null || d === undefined || d === '' ? null : new Date(d));

/** "14 Aug 2026" */
export function fmtDate(d: DateInput): string {
  const x = toDate(d);
  return x ? dateFmt.format(x).replace(/,/g, '') : '-';
}
/** "14 Aug" */
export function fmtDayMonth(d: DateInput): string {
  const x = toDate(d);
  return x ? dayMonthFmt.format(x) : '-';
}
/** "09:20" (WAT) */
export function fmtTime(d: DateInput): string {
  const x = toDate(d);
  return x ? timeFmt.format(x) : '-';
}
/** "14 Aug 2026 · 09:20" */
export function fmtDateTime(d: DateInput): string {
  const x = toDate(d);
  return x ? `${fmtDate(x)} · ${fmtTime(x)}` : '-';
}
/** "Thursday, 14 August 2026" */
export function fmtLongDate(d: DateInput): string {
  const x = toDate(d);
  return x ? longDateFmt.format(x) : '-';
}
/** "2026-08-14" in WAT — used for file names and date inputs. */
export function isoDateWAT(d: DateInput = new Date()): string {
  const x = toDate(d) ?? new Date();
  return isoDateFmt.format(x);
}

export function fmtNGN(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  return `NGN ${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "12 min ago", "2 h ago", "Today · 09:12", "3 days ago" */
export function fmtRelative(d: DateInput, now: Date = new Date()): string {
  const x = toDate(d);
  if (!x) return '-';
  const mins = Math.round((now.getTime() - x.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 6) return `${hours} h ago`;
  if (isoDateWAT(x) === isoDateWAT(now)) return `Today · ${fmtTime(x)}`;
  const days = Math.round(hours / 24);
  if (days <= 1) return 'Yesterday';
  return `${days} days ago`;
}

/** "2 Weeks", "3 Days", "5 Months" — Needs Attention "Since" column. */
export function fmtSince(d: DateInput, now: Date = new Date()): string {
  const x = toDate(d);
  if (!x) return '-';
  const days = Math.max(0, Math.floor((now.getTime() - x.getTime()) / 86400000));
  if (days < 1) return 'Today';
  if (days < 14) return `${days} ${days === 1 ? 'Day' : 'Days'}`;
  if (days < 60) return `${Math.floor(days / 7)} Weeks`;
  return `${Math.floor(days / 30)} Months`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function tagFromNumber(n: number): string {
  return `ECEWS-IT-${String(n).padStart(4, '0')}`;
}

export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]?.[0]}. ${parts[parts.length - 1]}`;
}
