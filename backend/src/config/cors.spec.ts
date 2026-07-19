import { createOriginMatcher } from './cors';

describe('createOriginMatcher', () => {
  it('matches exact origins only when no wildcard is configured', () => {
    const isAllowed = createOriginMatcher(['https://example.com']);
    expect(isAllowed('https://example.com')).toBe(true);
    expect(isAllowed('https://evil.com')).toBe(false);
    expect(isAllowed('https://example.com.evil.com')).toBe(false);
  });

  it('matches Vercel-style preview subdomains via a wildcard pattern', () => {
    const isAllowed = createOriginMatcher(['https://*.vercel.app']);
    expect(isAllowed('https://build-break-fix-git-main-me.vercel.app')).toBe(
      true,
    );
    expect(isAllowed('https://vercel.app')).toBe(false);
    expect(isAllowed('https://notvercel.app')).toBe(false);
  });

  it('allows requests with no Origin header (non-browser clients)', () => {
    const isAllowed = createOriginMatcher(['https://example.com']);
    expect(isAllowed(undefined)).toBe(true);
  });

  it('rejects everything when no patterns are configured', () => {
    const isAllowed = createOriginMatcher([]);
    expect(isAllowed('https://example.com')).toBe(false);
  });
});
