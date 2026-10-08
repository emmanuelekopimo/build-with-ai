import { describe, expect, it } from 'vitest';
import { hashToken, looksLikeToken, newToken, tokenMatches } from '../../src/server/lib/tokens';
import { redactUrl } from '../../src/server/lib/logger';

describe('tokens', () => {
  it('creates 256-bit url-safe tokens and stores only a hash', () => {
    const { token, hash } = newToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(looksLikeToken(token)).toBe(true);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
  });
  it('compares in constant time and rejects tampering', () => {
    const { token, hash } = newToken();
    expect(tokenMatches(token, hash)).toBe(true);
    const tampered = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
    expect(tokenMatches(tampered, hash)).toBe(false);
    expect(tokenMatches(token, null)).toBe(false);
  });
  it('rejects malformed tokens before any lookup', () => {
    expect(looksLikeToken('abc')).toBe(false);
    expect(looksLikeToken('x'.repeat(43) + '!')).toBe(false);
  });
  it('never logs tokens', () => {
    expect(redactUrl('/api/public/sign/abcDEF123?x=1')).toBe('/api/public/sign/[redacted]?x=1');
    expect(redactUrl('/approve/zzz')).toBe('/approve/[redacted]');
  });
});
