/**
 * Redemption invitation email (#471) — the grants preview lives HERE.
 *
 * The auth-first redemption flow has NO pre-auth in-app preview: the invitee
 * can't see what they were granted until after they sign in. So the email itself
 * must carry the grants preview. The wording mirrors the in-app redemption
 * screens (apps/launchpad/components/launchpad/redemption/screens.tsx):
 *   - account-invite → "Join <account> — added to an existing account"
 *   - app-grant      → "Get <app> access — you'll create your first account on arrival"
 * plus the /redeem?bundle=<id> bearer link.
 *
 * Pure rendering — no SES/AWS here, so it is trivially unit-testable.
 */

/** App slug → display label. Mirrors lib/admin/view-model.ts `appLabelMap`. */
const APP_LABEL: Record<string, string> = {
  'stock-analyser': 'Stock Analyser',
  'budget-tracker': 'Budget Tracker',
};

export function appLabel(slug: string): string {
  return APP_LABEL[slug] ?? slug;
}

/** A grant as the email presents it: a kind plus a human target label. */
export interface EmailGrant {
  kind: 'account-invite' | 'app-grant';
  /** Account name (account-invite) or app label (app-grant). */
  target: string;
}

export interface RedemptionEmail {
  subject: string;
  html: string;
  text: string;
}

/** Escape user-influenced text (account names) before HTML interpolation. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Headline + subline for one grant, matching the in-app redemption screens. */
function grantLines(g: EmailGrant): { headline: string; sub: string } {
  return g.kind === 'account-invite'
    ? { headline: `Join ${g.target}`, sub: 'Added to an existing account' }
    : { headline: `Get ${g.target} access`, sub: "You'll create your first account on arrival" };
}

/**
 * Render the redemption email (HTML + text) from a bundle's grants and its
 * bearer redeem link. `grants` must be non-empty (a bundle with no authorized
 * grants is never persisted, so no email is sent).
 */
export function buildRedemptionEmail(input: { grants: EmailGrant[]; redeemUrl: string }): RedemptionEmail {
  const { grants, redeemUrl } = input;

  const subject = 'You have been invited to Transformotion';

  // ── Plaintext part ──────────────────────────────────────────────────────
  const textLines = grants.map((g) => {
    const { headline, sub } = grantLines(g);
    return `  • ${headline} — ${sub}`;
  });
  const text = [
    'You have been invited to Transformotion.',
    '',
    "Here's what you'll get:",
    ...textLines,
    '',
    'Accept your invitation:',
    redeemUrl,
    '',
    'This invitation link is personal to you. If you were not expecting it, you can ignore this email.',
  ].join('\n');

  // ── HTML part (mirrors the forgot-provider email shell) ─────────────────
  const grantRows = grants
    .map((g) => {
      const { headline, sub } = grantLines(g);
      return `
        <tr><td style="padding:0 0 10px">
          <div style="background:#091523;border:1px solid #1A3550;border-radius:10px;padding:14px 18px">
            <p style="margin:0 0 2px;font-size:15px;font-weight:600;color:#00C4B3;font-family:sans-serif">${esc(headline)}</p>
            <p style="margin:0;font-size:13px;color:#7BAAC8;font-family:sans-serif">${esc(sub)}</p>
          </div>
        </td></tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D1B2A">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B2A;min-height:100vh">
  <tr><td align="center" style="padding:48px 16px">
    <table cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
      <tr><td style="padding-bottom:28px;text-align:center">
        <span style="font-family:'Helvetica Neue',sans-serif;font-size:26px;font-weight:900;letter-spacing:4px;color:#fff">T</span><span style="font-family:'Helvetica Neue',sans-serif;font-size:21px;font-weight:900;letter-spacing:4px;color:#fff">RANSFOR</span><span style="font-family:'Helvetica Neue',sans-serif;font-size:21px;font-weight:900;letter-spacing:4px;color:#00C4B3">M</span><span style="font-family:'Helvetica Neue',sans-serif;font-size:21px;font-weight:900;letter-spacing:4px;color:#E8A838">O</span><span style="font-family:'Helvetica Neue',sans-serif;font-size:21px;font-weight:900;letter-spacing:4px;color:#00C4B3">TION</span>
      </td></tr>
      <tr><td style="background:#112538;border:1px solid #1A3550;border-radius:16px;padding:32px">
        <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#fff;font-family:sans-serif">You're invited to Transformotion</p>
        <p style="margin:0 0 22px;font-size:14px;color:#7BAAC8;font-family:sans-serif">Here's what you'll get when you accept:</p>
        <table width="100%" cellpadding="0" cellspacing="0">${grantRows}
        </table>
        <a href="${esc(redeemUrl)}" style="display:inline-block;margin-top:22px;background:#00C4B3;color:#0D1B2A;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:sans-serif">Accept invitation &rarr;</a>
      </td></tr>
      <tr><td style="padding-top:20px;text-align:center">
        <p style="margin:0;font-size:12px;color:#7BAAC8;font-family:sans-serif">This link is personal to you. If you weren't expecting it, you can safely ignore this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html, text };
}
