import dns from 'node:dns'
import https from 'node:https'
import { CookieJar } from './cookie-jar.js'

dns.setDefaultResultOrder('ipv4first')

export interface ChromeHttpResponse {
  status: number
  url: string
  headers: Headers
  text: string
  json: () => Record<string, unknown>
}

const RETRY_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EHOSTUNREACH', 'UND_ERR_SOCKET'])

export function networkErrorMessage(url: string, error: unknown): string {
  const err = error as { message?: string; code?: string; cause?: { message?: string; code?: string } }
  const cause = err.cause ?? err
  return `请求失败 ${url}: ${[cause.code, cause.message, err.message].filter(Boolean).join(' | ')}`
}

export async function chromeRequest(
  cookies: CookieJar,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  attempt = 1
): Promise<ChromeHttpResponse> {
  const target = new URL(url)
  const headers = { ...(init.headers ?? {}) }
  const cookie = cookies.header(url)
  if (cookie) headers.cookie = cookie
  if (init.body && !headers['content-length']) headers['content-length'] = String(Buffer.byteLength(init.body))
  try {
    const raw = await new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }>((resolve, reject) => {
      const req = https.request({
        protocol: target.protocol,
        hostname: target.hostname,
        servername: target.hostname,
        port: Number(target.port || 443),
        path: `${target.pathname}${target.search}`,
        method: init.method ?? 'GET',
        headers,
        timeout: 25_000,
        ALPNProtocols: ['http/1.1']
      } as https.RequestOptions, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk as Buffer))
        res.on('end', () => resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8')
        }))
      })
      req.on('timeout', () => req.destroy(Object.assign(new Error('TIMEOUT'), { code: 'ETIMEDOUT' })))
      req.on('error', reject)
      if (init.body) req.write(init.body)
      req.end()
    })
    cookies.applySetCookie(raw.headers['set-cookie'], url)
    const headerMap = new Headers()
    for (const [key, value] of Object.entries(raw.headers)) {
      if (key === 'set-cookie' || value == null) continue
      headerMap.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    return {
      status: raw.status,
      url,
      headers: headerMap,
      text: raw.text,
      json: () => {
        try { return JSON.parse(raw.text) as Record<string, unknown> } catch { return {} }
      }
    }
  } catch (error) {
    const code = String((error as { code?: string }).code || (error as { cause?: { code?: string } }).cause?.code || '')
    if (attempt < 3 && RETRY_CODES.has(code)) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 400))
      return chromeRequest(cookies, url, init, attempt + 1)
    }
    throw new Error(networkErrorMessage(url, error))
  }
}
