export interface NotificationEmailInput {
  appUrl: string;
  accountId: string;
  ticker: string;
  sourceType: 'Portfolio' | 'Watchlist';
  verdict: 'BUY' | 'SELL';
  company?: string;
  summary?: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appLink(appUrl: string): string {
  try {
    return new URL('/stock-analyser/', appUrl).toString();
  } catch {
    return appUrl;
  }
}

function logoUrl(appUrl: string): string {
  try {
    return new URL('/stock-analyser/images/brand/transformotion-logo-transparent.png', appUrl).toString();
  } catch {
    return '/stock-analyser/images/brand/transformotion-logo-transparent.png';
  }
}

export function buildNotificationEmail(input: NotificationEmailInput) {
  const sourceLabel = input.sourceType === 'Portfolio' ? 'portfolio holding' : 'watchlist item';
  const title = `${input.ticker} is now ${input.verdict}`;
  const subject = `Stock Analyser alert: ${title}`;
  const displayName = input.company ? `${input.company} (${input.ticker})` : input.ticker;
  const link = appLink(input.appUrl);

  const text = [
    title,
    '',
    `${displayName} from your ${sourceLabel} has moved to ${input.verdict}.`,
    input.summary ? `Summary: ${input.summary}` : '',
    '',
    `Open Stock Analyser: ${link}`,
    '',
    'This email was sent because notification consent is enabled for your account membership.',
  ].filter(Boolean).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#23476B">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#23476B;min-height:100vh">
  <tr><td align="center" style="padding:48px 16px">
    <table cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">
      <tr><td style="padding-bottom:28px;text-align:center">
        <img src="${esc(logoUrl(input.appUrl))}" alt="Transformotion" width="220" style="display:inline-block;width:220px;max-width:80%;height:auto;border:0">
      </td></tr>
      <tr><td style="background:#0E2339;border:1px solid #587494;border-radius:16px;padding:32px">
        <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#fff;font-family:sans-serif">${esc(title)}</p>
        <p style="margin:0 0 22px;font-size:14px;color:#EBEFF2;font-family:sans-serif">${esc(displayName)} from your ${esc(sourceLabel)} has moved to <strong style="color:#33C1C5">${input.verdict}</strong>.</p>
        ${input.summary ? `<div style="background:#1D2F44;border:1px solid #587494;border-radius:10px;padding:14px 18px;margin-bottom:24px"><p style="margin:0;font-size:13px;line-height:1.5;color:#EBEFF2;font-family:sans-serif">${esc(input.summary)}</p></div>` : ''}
        <a href="${esc(link)}" style="display:inline-block;background:#33C1C5;color:#0E2339;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:sans-serif">Open Stock Analyser &rarr;</a>
      </td></tr>
      <tr><td style="padding-top:20px;text-align:center">
        <p style="margin:0;font-size:12px;color:#EBEFF2;font-family:sans-serif">Sent only to active write-access members with notification consent enabled.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, text, html };
}
