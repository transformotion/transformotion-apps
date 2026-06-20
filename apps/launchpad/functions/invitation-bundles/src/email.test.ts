import { describe, it, expect } from 'vitest';
import { buildRedemptionEmail } from './email';

describe('buildRedemptionEmail (#471 grants preview)', () => {
  const redeemUrl = 'https://dev.apps.transformotion.com.au/redeem?bundle=abc-123';

  it('renders the account-invite and app-grant preview lines (mirrors the redemption screens)', () => {
    const { subject, html, text } = buildRedemptionEmail({
      grants: [
        { kind: 'account-invite', target: 'Apex Capital' },
        { kind: 'app-grant', target: 'Stock Analyser' },
      ],
      redeemUrl,
    });

    expect(subject).toMatch(/invited to Transformotion/i);

    // account-invite wording
    expect(text).toContain('Join Apex Capital');
    expect(text).toContain('Added to an existing account');
    expect(html).toContain('Join Apex Capital');

    // app-grant wording
    expect(text).toContain('Get Stock Analyser access');
    expect(text).toContain("You'll create your first account on arrival");
    expect(html).toContain('Get Stock Analyser access');

    // bearer link present in both parts
    expect(text).toContain(redeemUrl);
    expect(html).toContain(redeemUrl);
  });

  it('HTML-escapes user-influenced account names (no injection)', () => {
    const { html } = buildRedemptionEmail({
      grants: [{ kind: 'account-invite', target: '<script>x</script> & "co"' }],
      redeemUrl,
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });
});
