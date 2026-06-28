// Provider-specific shaping of a canonical (v0) JSON Schema for structured
// output. The canonical schema is NEVER mutated; each provider gets a shaped
// COPY here (behaviour.md: "provider-specific shaping ... applied by the runtime
// on top of the canonical schema, never baked into it").

/** Stable name for the structured-output schema/tool across providers. */
export const STRUCTURED_OUTPUT_NAME = 'analysis_result';

type SchemaObject = Record<string, unknown>;

function isObject(value: unknown): value is SchemaObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Meta keywords no provider format wants in the payload schema.
const META_KEYS = new Set(['$schema', '$id', 'title']);
// Keywords OpenAI strict structured outputs does NOT support — must be stripped.
const OPENAI_UNSUPPORTED = new Set(['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'format', 'pattern']);

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
