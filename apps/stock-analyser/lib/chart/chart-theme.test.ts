import { describe, expect, it } from 'vitest';
import { CANDLESTICK_COLORS, CHART_THEME } from './chart-theme';

const allColors = [
  ...Object.values(CHART_THEME),
  ...Object.values(CANDLESTICK_COLORS),
].filter((value): value is string => typeof value === 'string');

describe('chart theme colors', () => {
  it('uses chart-safe literal colors instead of CSS variable expressions', () => {
    expect(allColors.length).toBeGreaterThan(0);

    for (const color of allColors) {
      expect(color).not.toContain('var(');
      expect(color).not.toContain('hsl(');
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
