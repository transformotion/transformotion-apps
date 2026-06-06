export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
}

export function parseAIJsonResponse<T>(content: string): T {
  try {
    return JSON.parse(stripCodeFences(content)) as T
  } catch {
    throw Object.assign(
      new Error('Claude returned a non-JSON response. Check the prompt includes explicit JSON instructions.'),
      { __jobError: true },
    )
  }
}
