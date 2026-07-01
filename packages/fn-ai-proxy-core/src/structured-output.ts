// Provider-specific shaping of a canonical (v0) JSON Schema for structured
// output. The canonical schema is NEVER mutated; each provider gets a shaped
// COPY here (behaviour.md: "provider-specific shaping ... applied by the runtime
// on top of the canonical schema, never baked into it").

/** Stable name for the structured-output schema/tool across providers. */
export const STRUCTURED_OUTPUT_NAME = 'analysis_result';
export const GROUNDED_RESEARCH_AVAILABLE = 'DATA_STATUS: AVAILABLE';
export const GROUNDED_RESEARCH_UNAVAILABLE = 'DATA_STATUS: UNAVAILABLE';

type SchemaObject = Record<string, unknown>;

function isObject(value: unknown): value is SchemaObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Meta keywords no provider format wants in the payload schema.
const META_KEYS = new Set(['$schema', '$id', 'title']);
// Keywords OpenAI strict structured outputs does NOT support — must be stripped.
const OPENAI_UNSUPPORTED = new Set(['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'format', 'pattern']);
// Anthropic strict tool-use accepts a narrower JSON Schema subset than its
// normal tool schema. Keep type/required/properties/items/enums, then enforce
// the richer canonical constraints in runtime post-validation.
const ANTHROPIC_STRICT_UNSUPPORTED = new Set(['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'format', 'pattern']);

/**
 * Shape a canonical schema for **OpenAI strict** structured outputs:
 *  - drop meta ($schema/$id/title) and unsupported validation keywords,
 *  - force `additionalProperties: false` on every object,
 *  - force `required` to ALL properties (strict mode requires it; the canonical
 *    schemas already require all, so this is idempotent there).
 */
export function toOpenAiStrictSchema(schema: unknown): SchemaObject {
  if (!isObject(schema)) return {};
  const out: SchemaObject = {};
  for (const [key, value] of Object.entries(schema)) {
    if (META_KEYS.has(key) || OPENAI_UNSUPPORTED.has(key)) continue;
    if (key === 'properties' && isObject(value)) {
      const props: SchemaObject = {};
      for (const [propKey, propVal] of Object.entries(value)) props[propKey] = toOpenAiStrictSchema(propVal);
      out['properties'] = props;
    } else if (key === 'items') {
      out['items'] = toOpenAiStrictSchema(value);
    } else if (key === 'required') {
      // replaced below for objects
    } else {
      out[key] = value;
    }
  }
  if (out['type'] === 'object' && isObject(out['properties'])) {
    out['required'] = Object.keys(out['properties'] as SchemaObject);
    out['additionalProperties'] = false;
  }
  return out;
}

/**
 * Shape a canonical schema for **Anthropic forced tool-use** (`input_schema`).
 * Anthropic accepts standard JSON Schema, so only the meta keywords are dropped;
 * the contract's `required` / constraints are preserved.
 */
export function toAnthropicInputSchema(schema: unknown): SchemaObject {
  if (!isObject(schema)) return { type: 'object' };
  const out: SchemaObject = {};
  for (const [key, value] of Object.entries(schema)) {
    if (META_KEYS.has(key)) continue;
    if (key === 'properties' && isObject(value)) {
      const props: SchemaObject = {};
      for (const [propKey, propVal] of Object.entries(value)) props[propKey] = toAnthropicInputSchema(propVal);
      out['properties'] = props;
    } else if (key === 'items') {
      out['items'] = toAnthropicInputSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Shape a canonical schema for Anthropic strict tool-use. */
export function toAnthropicStrictInputSchema(schema: unknown): SchemaObject {
  if (!isObject(schema)) return { type: 'object' };
  const out: SchemaObject = {};
  for (const [key, value] of Object.entries(schema)) {
    if (META_KEYS.has(key) || ANTHROPIC_STRICT_UNSUPPORTED.has(key)) continue;
    if (key === 'properties' && isObject(value)) {
      const props: SchemaObject = {};
      for (const [propKey, propVal] of Object.entries(value)) props[propKey] = toAnthropicStrictInputSchema(propVal);
      out['properties'] = props;
    } else if (key === 'items') {
      out['items'] = toAnthropicStrictInputSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * What KIND of thing the Live research pass is grounding — determines the
 * DATA_STATUS availability rubric.
 *  - `security` (default): a single tradable instrument (the Analyser). Availability
 *    requires a verified active instrument + current price/change + technical context.
 *  - `market`: a market REGION (Market Analysis). Availability is REGION-appropriate —
 *    current macro + per-sector reads — NOT tradable-instrument/price/RSI. Applying the
 *    security rubric to a region wrongly declares UNAVAILABLE (the #601/market bug).
 */
export type GroundingKind = 'security' | 'market';

export function buildGroundedResearchPrompt(originalPrompt: string, kind: GroundingKind = 'security'): string {
  const availabilityRubric =
    kind === 'market'
      ? 'This is a MARKET/REGION analysis, NOT a single tradable instrument. Enough evidence means current MACRO conditions for the region (interest-rate direction, inflation, growth/activity) AND a per-sector read (how each major/mapped sector is faring, with relevant current events). Do NOT require a tradable instrument, a single price/change, or RSI/technical readings — those do not apply to a region. Where SUPPLIED sector price data is included in the request, treat it as authoritative and base each sector read on it.'
      : 'For ticker/security analysis, enough evidence includes a verified active tradable instrument, current price/change, and enough price/volume/technical context to support the technical fields.';
  return (
    'Use current web search to collect grounded evidence for every required field in this structured-output Live request. ' +
    'Do not infer facts from ticker conventions, naming patterns, stale memory, or generic market behaviour. ' +
    `Begin the response with exactly one status line: "${GROUNDED_RESEARCH_AVAILABLE}" if current search results (and any supplied data) provide enough reliable evidence to populate the required fields, or "${GROUNDED_RESEARCH_UNAVAILABLE}" if any required field would need guessing. ` +
    availabilityRubric + ' ' +
    'If unavailable, explain what is missing and do not invent placeholder or numeric technicals.\n\n' +
    `Original request:\n${originalPrompt}`
  );
}

export function groundedResearchIsUnavailable(grounded: string): boolean {
  const prefix = grounded.slice(0, 1000).toUpperCase();
  return (
    prefix.includes(GROUNDED_RESEARCH_UNAVAILABLE) ||
    /["']?DATA_STATUS["']?\s*[:=]\s*["']?UNAVAILABLE/.test(prefix)
  );
}
