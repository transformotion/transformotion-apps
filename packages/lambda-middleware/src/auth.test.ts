import { describe, it, expect } from 'vitest';
import {
  requireSiteAdmin,
  requireAppAccess,
  requireAnyAppAccess,
  requireAccountAccess,
  requireAccountOwner,
  requireGroup,
  extractAuthClaims,
} from './auth';
import type { AuthClaims } from './types';
import { HttpError } from './errors';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClaims(overrides: Partial<AuthClaims> = {}): AuthClaims {
  return {
    userId:    'user-1',
    email:     'user@example.com',
    groups:    [],
    apps:      [],
    accounts:  {},
    siteAdmin: false,
    ...overrides,
  };
}

function makeEvent(claimsMap: Record<string, string>): APIGatewayProxyEvent {
  return {
    requestContext: { authorizer: { claims: claimsMap } },
    headers: {},
  } as unknown as APIGatewayProxyEvent;
}

// ── extractAuthClaims ─────────────────────────────────────────────────────────

describe('extractAuthClaims', () => {
  it('parses required fields', () => {
    const claims = extractAuthClaims(makeEvent({ sub: 'u1', email: 'a@b.com' }));
    expect(claims.userId).toBe('u1');
    expect(claims.email).toBe('a@b.com');
    expect(claims.groups).toEqual([]);
    expect(claims.apps).toEqual([]);
    expect(claims.accounts).toEqual({});
    expect(claims.siteAdmin).toBe(false);
  });

  it('parses legacy cognito:groups', () => {
    const claims = extractAuthClaims(makeEvent({
      sub: 'u1', email: 'a@b.com',
      'cognito:groups': 'budget-app budget-app-access',
    }));
    expect(claims.groups).toEqual(['budget-app', 'budget-app-access']);
  });

  it('parses apps JSON claim', () => {
    const claims = extractAuthClaims(makeEvent({
      sub: 'u1', email: 'a@b.com',
      apps: '["budget-tracker","stock-signal"]',
    }));
    expect(claims.apps).toEqual(['budget-tracker', 'stock-signal']);
  });

  it('parses accounts JSON claim', () => {
    const claims = extractAuthClaims(makeEvent({
      sub: 'u1', email: 'a@b.com',
      accounts: '{"budget-tracker":[{"accountId":"acc-1","role":"member"}]}',
    }));
    expect(claims.accounts).toEqual({ 'budget-tracker': [{ accountId: 'acc-1', role: 'member' }] });
  });

  it('parses site_admin claim', () => {
    const claims = extractAuthClaims(makeEvent({ sub: 'u1', email: 'a@b.com', site_admin: 'true' }));
    expect(claims.siteAdmin).toBe(true);
  });

  it('falls back gracefully when apps/accounts are malformed JSON', () => {
    const claims = extractAuthClaims(makeEvent({
      sub: 'u1', email: 'a@b.com', apps: 'not-json', accounts: '{bad}',
    }));
    expect(claims.apps).toEqual([]);
    expect(claims.accounts).toEqual({});
  });

  it('throws 401 when claims are missing', () => {
    const event = { requestContext: {} } as unknown as APIGatewayProxyEvent;
    expect(() => extractAuthClaims(event)).toThrow(HttpError);
  });

  it('throws 401 when sub is missing', () => {
    expect(() => extractAuthClaims(makeEvent({ email: 'a@b.com' }))).toThrow(HttpError);
  });
});

// ── requireSiteAdmin ──────────────────────────────────────────────────────────

describe('requireSiteAdmin', () => {
  it('passes when siteAdmin claim is true', () => {
    expect(() => requireSiteAdmin(makeClaims({ siteAdmin: true }))).not.toThrow();
  });

  it('throws 403 when only legacy admin group is present', () => {
    expect(() => requireSiteAdmin(makeClaims({ groups: ['admin'] }))).toThrow(HttpError);
  });

  it('throws 403 when only legacy site-admin group is present', () => {
    expect(() => requireSiteAdmin(makeClaims({ groups: ['site-admin'] }))).toThrow(HttpError);
  });

  it('throws 403 for regular user with no claims', () => {
    expect(() => requireSiteAdmin(makeClaims())).toThrow(HttpError);
  });
});

// ── requireAppAccess ──────────────────────────────────────────────────────────

describe('requireAppAccess', () => {
  it('passes when app is in apps claim', () => {
    expect(() => requireAppAccess(
      makeClaims({ apps: ['budget-tracker'] }), 'budget-tracker',
    )).not.toThrow();
  });

  it('passes when siteAdmin is true regardless of apps claim', () => {
    expect(() => requireAppAccess(makeClaims({ siteAdmin: true }), 'budget-tracker')).not.toThrow();
  });

  it('throws 403 when apps claim is empty (fail closed — no group fallback)', () => {
    expect(() => requireAppAccess(
      makeClaims({ groups: ['budget-app'] }), 'budget-tracker',
    )).toThrow(HttpError);
  });

  it('throws 403 when apps claim is empty', () => {
    expect(() => requireAppAccess(makeClaims(), 'budget-tracker')).toThrow(HttpError);
  });

  it('throws 403 when user has access to a different app only', () => {
    expect(() => requireAppAccess(
      makeClaims({ apps: ['stock-signal'] }), 'budget-tracker',
    )).toThrow(HttpError);
  });
});

// ── requireAnyAppAccess ───────────────────────────────────────────────────────

describe('requireAnyAppAccess', () => {
  it('passes when user has at least one of the apps', () => {
    expect(() => requireAnyAppAccess(
      makeClaims({ apps: ['budget-tracker'] }), ['budget-tracker', 'stock-signal'],
    )).not.toThrow();
  });

  it('passes when siteAdmin is true', () => {
    expect(() => requireAnyAppAccess(
      makeClaims({ siteAdmin: true }), ['budget-tracker', 'stock-signal'],
    )).not.toThrow();
  });

  it('throws 403 when user has neither app in apps claim (fail closed — no group fallback)', () => {
    expect(() => requireAnyAppAccess(
      makeClaims({ groups: ['stock-app'] }), ['budget-tracker', 'stock-signal'],
    )).toThrow(HttpError);
  });

  it('throws 403 when user has neither app', () => {
    expect(() => requireAnyAppAccess(makeClaims(), ['budget-tracker', 'stock-signal'])).toThrow(HttpError);
  });
});

// ── requireAccountAccess ──────────────────────────────────────────────────────

describe('requireAccountAccess', () => {
  it('passes when user has member access to account', () => {
    expect(() => requireAccountAccess(
      makeClaims({ accounts: { 'budget-tracker': [{ accountId: 'acc-1', role: 'member' }] } }),
      'budget-tracker', 'acc-1',
    )).not.toThrow();
  });

  it('passes when user has viewer access and viewer is required', () => {
    expect(() => requireAccountAccess(
      makeClaims({ accounts: { 'budget-tracker': [{ accountId: 'acc-1', role: 'viewer' }] } }),
      'budget-tracker', 'acc-1', 'viewer',
    )).not.toThrow();
  });

  it('throws 403 when user has viewer but member is required', () => {
    expect(() => requireAccountAccess(
      makeClaims({ accounts: { 'budget-tracker': [{ accountId: 'acc-1', role: 'viewer' }] } }),
      'budget-tracker', 'acc-1', 'member',
    )).toThrow(HttpError);
  });

  it('passes when user has manager access and member is required', () => {
    expect(() => requireAccountAccess(
      makeClaims({ accounts: { 'budget-tracker': [{ accountId: 'acc-1', role: 'manager' }] } }),
      'budget-tracker', 'acc-1', 'member',
    )).not.toThrow();
  });

  it('passes when user has owner access and manager is required', () => {
    expect(() => requireAccountAccess(
      makeClaims({ accounts: { 'budget-tracker': [{ accountId: 'acc-1', role: 'owner' }] } }),
      'budget-tracker', 'acc-1', 'manager',
    )).not.toThrow();
  });

  it('throws 403 when user has member but manager is required', () => {
    expect(() => requireAccountAccess(
      makeClaims({ accounts: { 'budget-tracker': [{ accountId: 'acc-1', role: 'member' }] } }),
      'budget-tracker', 'acc-1', 'manager',
    )).toThrow(HttpError);
  });

  it('throws 403 when user has access to different account only', () => {
    expect(() => requireAccountAccess(
      makeClaims({ accounts: { 'budget-tracker': [{ accountId: 'acc-2', role: 'member' }] } }),
      'budget-tracker', 'acc-1',
    )).toThrow(HttpError);
  });

  it('throws 403 when accounts claim is empty (fail closed — no group fallback)', () => {
    expect(() => requireAccountAccess(
      makeClaims({ groups: ['budget-app'] }), 'budget-tracker', 'acc-1',
    )).toThrow(HttpError);
  });

  it('throws 403 when accounts claim is empty', () => {
    expect(() => requireAccountAccess(makeClaims(), 'budget-tracker', 'acc-1')).toThrow(HttpError);
  });

  it('passes for site admin', () => {
    expect(() => requireAccountAccess(
      makeClaims({ siteAdmin: true }), 'budget-tracker', 'acc-1',
    )).not.toThrow();
  });
});

// ── requireAccountOwner ───────────────────────────────────────────────────────

describe('requireAccountOwner', () => {
  it('passes when user has owner role', () => {
    expect(() => requireAccountOwner(
      makeClaims({ accounts: { 'budget-tracker': [{ accountId: 'acc-1', role: 'owner' }] } }),
      'budget-tracker', 'acc-1',
    )).not.toThrow();
  });

  it('throws 403 when user has manager but not owner', () => {
    expect(() => requireAccountOwner(
      makeClaims({ accounts: { 'budget-tracker': [{ accountId: 'acc-1', role: 'manager' }] } }),
      'budget-tracker', 'acc-1',
    )).toThrow(HttpError);
  });

  it('throws 403 when accounts claim is empty', () => {
    expect(() => requireAccountOwner(makeClaims(), 'budget-tracker', 'acc-1')).toThrow(HttpError);
  });

  it('passes for site admin', () => {
    expect(() => requireAccountOwner(makeClaims({ siteAdmin: true }), 'budget-tracker', 'acc-1')).not.toThrow();
  });
});

// ── requireGroup (legacy, still exported) ────────────────────────────────────

describe('requireGroup', () => {
  it('passes when user is in a required group', () => {
    expect(() => requireGroup(makeClaims({ groups: ['admin'] }), 'admin')).not.toThrow();
  });

  it('throws 403 when user is in none of the required groups', () => {
    expect(() => requireGroup(makeClaims({ groups: ['other'] }), 'admin', 'site-admin')).toThrow(HttpError);
  });
});
