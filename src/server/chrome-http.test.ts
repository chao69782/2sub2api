import { once } from 'node:events'
import http from 'node:http'
import https from 'node:https'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chromeRequest } from './chrome-http.js'
import { CookieJar } from './cookie-jar.js'

afterEach(() => vi.restoreAllMocks())

describe('Chrome HTTP response headers', () => {
  it.each([200, 302])('reads HTTP %s responses with large headers without losing cookies or redirect metadata', async (status) => {
    const policy = `script-src ${'https://cdn.example/ '.repeat(3200)}`
    const cookieValues = ['a', 'b', 'c'].map((value) => value.repeat(4000))
    const location = 'https://auth.openai.com/authorize?state=test-state'
    const server = http.createServer((_request, response) => {
      response.writeHead(status, {
        'content-security-policy': policy,
        'set-cookie': cookieValues.map((value, index) => `session.${index}=${value}; Path=/; HttpOnly; Secure`),
        'content-type': 'application/json',
        ...(status === 302 ? { location } : {})
      })
      response.end(JSON.stringify({ ok: true }))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    // Keep Node's real HTTP parser; only replace TLS with a loopback HTTP connection.
    vi.spyOn(https, 'request').mockImplementation(((options: https.RequestOptions, callback: (response: http.IncomingMessage) => void) => {
      return http.request({ ...options, protocol: 'http:', agent: false }, callback)
    }) as typeof https.request)

    try {
      const port = (server.address() as AddressInfo).port
      const cookies = new CookieJar()
      const result = await chromeRequest(cookies, `https://127.0.0.1:${port}/`)
      expect(result.status).toBe(status)
      expect(result.json()).toEqual({ ok: true })
      expect(result.headers.get('content-security-policy')).toBe(policy.trimEnd())
      expect(result.headers.get('location')).toBe(status === 302 ? location : null)
      expect(cookies.all()).toEqual(cookieValues.map((value, index) => ({ name: `session.${index}`, value })))
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
