// Single source of "now" for domain services. Production always uses the real time; the seed
// script pins it to replay historic workflows (e.g. the AB-06 timeline) through the real services.
let fixed: Date | null = null;

export function now(): Date {
  return fixed ? new Date(fixed.getTime()) : new Date();
}

/** Seed/test only: pin the clock (null restores real time). */
export function setClock(d: Date | null): void {
  fixed = d;
}
