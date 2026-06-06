import { describe, expect, it } from 'vitest'
import { parseAIJsonResponse, stripCodeFences } from './response'

describe('stripCodeFences', () => {
  it('removes json markdown code fences', () => {
    expect(stripCodeFences('```json\n{"ok":true}\n```')).toBe('{"ok":true}')
  })

  it('leaves plain json untouched', () => {
    expect(stripCodeFences('{"ok":true}')).toBe('{"ok":true}')
  })
})

describe('parseAIJsonResponse', () => {
  it('parses fenced json content', () => {
    expect(parseAIJsonResponse<{ ok: boolean }>('```json\n{"ok":true}\n```')).toEqual({ ok: true })
  })

  it('throws a job error for non-json content', () => {
    expect(() => parseAIJsonResponse('not json')).toThrow(/non-JSON response/)
  })
})
