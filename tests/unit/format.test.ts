import { describe, expect, it } from 'vitest';
import { fmtDate, fmtDateTime, fmtDayMonth, fmtNGN, fmtSince, initials, isoDateWAT, tagFromNumber } from '../../src/shared/format';
import { scoreChecks } from '../../src/shared/constants';

describe('format', () => {
  it('formats dates like "14 Aug 2026" in WAT, with three-letter months', () => {
    expect(fmtDate('2026-08-14T09:12:00+01:00')).toBe('14 Aug 2026');
    expect(fmtDate('2026-09-26T10:00:00Z')).toBe('26 Sep 2026');
    expect(fmtDayMonth('2026-08-14T09:20:00+01:00')).toBe('14 Aug');
    expect(fmtDateTime('2026-08-14T09:12:00+01:00')).toBe('14 Aug 2026 · 09:12');
    // 23:30 UTC is already the next day in Lagos.
    expect(fmtDate('2026-08-13T23:30:00Z')).toBe('14 Aug 2026');
    expect(isoDateWAT(new Date('2026-08-13T23:30:00Z'))).toBe('2026-08-14');
    expect(fmtDate(null)).toBe('-');
  });
  it('formats money, tags, initials and "since"', () => {
    expect(fmtNGN(1250000)).toBe('NGN 1,250,000.00');
    expect(tagFromNumber(1)).toBe('ECEWS-IT-0001');
    expect(tagFromNumber(12345)).toBe('ECEWS-IT-12345');
    expect(initials('Edidiong Okon')).toBe('EO');
    const now = new Date('2026-08-28T10:00:00Z');
    expect(fmtSince('2026-08-14T10:00:00Z', now)).toBe('2 Weeks');
    expect(fmtSince('2026-08-25T10:00:00Z', now)).toBe('3 Days');
  });
  it('scores the intake checklist as "X of Y" with N/A excluded (D11)', () => {
    expect(scoreChecks(['YES', 'YES', 'YES', 'NA', 'YES', 'YES', 'YES'])).toEqual({ passed: 6, scorable: 6 });
    expect(scoreChecks(['YES', 'NO', null, 'NA', 'YES', 'YES', 'NO'])).toEqual({ passed: 3, scorable: 6 });
    expect(scoreChecks([])).toEqual({ passed: 0, scorable: 7 });
  });
});
