import { describe, it, expect } from 'vitest';
import { joinControlPlaneUrl } from './control-plane';

const HOST = 'https://qrwal90470.execute-api.ap-southeast-2.amazonaws.com';

describe('joinControlPlaneUrl — preserves the API Gateway stage (#423)', () => {
  it('keeps the /dev stage when base has it and path is absolute (the bug)', () => {
    // new URL('/api/user/profile', `${HOST}/dev/`) would have dropped /dev.
    expect(joinControlPlaneUrl(`${HOST}/dev/`, '/api/user/profile')).toBe(
      `${HOST}/dev/api/user/profile`,
    );
  });

  it('works when the base has no trailing slash', () => {
    expect(joinControlPlaneUrl(`${HOST}/dev`, '/api/user/profile')).toBe(
      `${HOST}/dev/api/user/profile`,
    );
  });

  it('works when the path has no leading slash', () => {
    expect(joinControlPlaneUrl(`${HOST}/dev/`, 'api/user/active-accounts')).toBe(
      `${HOST}/dev/api/user/active-accounts`,
    );
  });

  it('tolerates redundant slashes on both sides', () => {
    expect(joinControlPlaneUrl(`${HOST}/dev//`, '//auth/setup')).toBe(`${HOST}/dev/auth/setup`);
  });

  it('preserves nested/encoded path segments', () => {
    expect(
      joinControlPlaneUrl(`${HOST}/dev/`, '/accounts/acct-123/members/user-9'),
    ).toBe(`${HOST}/dev/accounts/acct-123/members/user-9`);
  });

  it('works with a multi-segment stage', () => {
    expect(joinControlPlaneUrl(`${HOST}/v1/dev/`, '/api/user/profile')).toBe(
      `${HOST}/v1/dev/api/user/profile`,
    );
  });

  it('works against a bare origin (no stage)', () => {
    expect(joinControlPlaneUrl(HOST, '/api/user/profile')).toBe(`${HOST}/api/user/profile`);
  });
});
