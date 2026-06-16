import { describe, it, expect, afterEach, vi } from 'vitest';
import { devToolsEnabled, devToolVisible } from './dev-tools';

describe('devToolsEnabled — default ON, only an explicit "false" disables', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('is ON when NEXT_PUBLIC_DEV_TOOLS is unset (dev default)', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_TOOLS', '');
    expect(devToolsEnabled()).toBe(true);
    expect(devToolVisible()).toBe(true);
  });

  it('is ON when set to "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_TOOLS', 'true');
    expect(devToolsEnabled()).toBe(true);
  });

  it('is OFF ONLY when explicitly "false" (the prod requirement)', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_TOOLS', 'false');
    expect(devToolsEnabled()).toBe(false);
    expect(devToolVisible()).toBe(false);
  });

  it('is ON for any other value (fail-safe-open in dev; prod must use exactly "false")', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_TOOLS', 'no');
    expect(devToolsEnabled()).toBe(true);
  });
});
