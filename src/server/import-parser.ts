export interface ParsedCredential {
  email: string
  password: string
  totpSecret: string
}

export type ParseResult =
  | { ok: true; value: ParsedCredential }
  | { ok: false; reason: 'empty' | 'invalid' | 'ambiguous'; message: string }

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const base32Pattern = /^[A-Z2-7]+=*$/

export function normalizeTotpSecret(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed.toLowerCase().startsWith('otpauth://')) {
    try {
      const secret = new URL(trimmed).searchParams.get('secret') ?? ''
      const normalized = secret.replace(/[\s-]/g, '').toUpperCase()
      return normalized.length >= 16 && base32Pattern.test(normalized) ? normalized : null
    } catch {
      return null
    }
  }
  const normalized = trimmed.replace(/\s/g, '').toUpperCase()
  return normalized.length >= 16 && base32Pattern.test(normalized) ? normalized : null
}

export function parseCredentialLine(line: string): ParseResult {
  if (!line.trim()) return { ok: false, reason: 'empty', message: '空行' }

  const delimiters = [...line.matchAll(/-{2,}/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length
  }))
  const candidates = new Map<string, ParsedCredential>()

  for (let first = 0; first < delimiters.length - 1; first += 1) {
    for (let second = first + 1; second < delimiters.length; second += 1) {
      const left = delimiters[first]
      const right = delimiters[second]
      const email = line.slice(0, left.start).trim().toLowerCase()
      const password = line.slice(left.end, right.start)
      const totpSecret = normalizeTotpSecret(line.slice(right.end))
      if (!emailPattern.test(email) || password.length === 0 || !totpSecret) continue
      const value = { email, password, totpSecret }
      candidates.set(JSON.stringify(value), value)
    }
  }

  if (candidates.size === 1) return { ok: true, value: [...candidates.values()][0] }
  if (candidates.size > 1) {
    return { ok: false, reason: 'ambiguous', message: '该行存在多个合法切分方式，请使用单条表单确认' }
  }
  return { ok: false, reason: 'invalid', message: '格式无效：需要两个独立的连续 2 个及以上半角 - 分隔符' }
}

export function parseCredentialText(text: string): Array<{ line: number; result: ParseResult }> {
  return text.split(/\r?\n/).map((line, index) => ({ line: index + 1, result: parseCredentialLine(line) }))
}
