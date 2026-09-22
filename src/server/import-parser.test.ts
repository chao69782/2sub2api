import { describe, expect, it } from 'vitest'
import { parseCredentialLine } from './import-parser.js'

const secret = 'JBSWY3DPEHPK3PXP'

describe('parseCredentialLine', () => {
  it.each([
    `a@example.com--Password--${secret}`,
    `a@example.com----Password------${secret}`,
    `a@example.com--Password-----${secret}`,
    `a@example.com------Pass-word---${secret}`
  ])('accepts independent delimiter lengths: %s', (input) => {
    const result = parseCredentialLine(input)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.email).toBe('a@example.com')
  })

  it('preserves single hyphens in passwords', () => {
    const result = parseCredentialLine(`a@example.com--Pass-word--${secret}`)
    expect(result.ok && result.value.password).toBe('Pass-word')
  })

  it('rejects a one-character first separator', () => {
    expect(parseCredentialLine(`a@example.com-Password--${secret}`).ok).toBe(false)
  })
})
