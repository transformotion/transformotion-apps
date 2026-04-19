/**
 * Robust JSON parser — mirrors parseJSON() in stock-signal-analyser.html.
 *
 * Handles:
 *   - Markdown code fences (```json ... ```)
 *   - Extra text before/after the JSON object or array
 *   - Trailing commas
 *   - Control characters embedded in strings
 *
 * Throws if no parseable JSON can be extracted.
 */
export function parseJSON<T = unknown>(raw: string): T {
  // Strip markdown code fences
  let text = raw.replace(/```json\s*|```\s*/g, '').trim();

  // Fast path: direct parse
  try { return JSON.parse(text) as T; } catch { /* fall through */ }

  // Find first complete {...} or [...] using depth tracking
  for (const [open, close] of [['{', '}'], ['[', ']']] as [string, string][]) {
    let depth = 0, start = -1, end = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === open)  { if (depth === 0) start = i; depth++; }
      else if (text[i] === close) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (start !== -1 && end !== -1) {
      const slice = text.slice(start, end + 1);
      try { return JSON.parse(slice) as T; } catch { /* fall through */ }
      // Try stripping control chars and trailing commas
      try {
        const cleaned = slice
          .replace(/[\x00-\x1F\x7F]/g, ' ')
          .replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(cleaned) as T;
      } catch { /* fall through */ }
    }
  }

  throw new Error('Could not parse response — please try again.');
}
