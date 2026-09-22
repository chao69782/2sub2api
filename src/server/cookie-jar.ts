export class CookieJar {
  private readonly cookies = new Map<string, { name: string; value: string; domain: string; path: string }>()

  applySetCookie(header: string | string[] | null | undefined, requestUrl: string): void {
    const values = !header ? [] : Array.isArray(header) ? header : [header]
    const host = new URL(requestUrl).hostname
    for (const line of values) {
      const parts = line.split(';').map((item) => item.trim()).filter(Boolean)
      const [pair] = parts
      if (!pair || !pair.includes('=')) continue
      const eq = pair.indexOf('=')
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      if (!name) continue
      let domain = host
      let cookiePath = '/'
      for (const attr of parts.slice(1)) {
        const [key, attrValue] = attr.split('=').map((item) => item.trim())
        if (key.toLowerCase() === 'domain' && attrValue) domain = attrValue.replace(/^\./, '')
        if (key.toLowerCase() === 'path' && attrValue) cookiePath = attrValue
      }
      this.cookies.set(`${domain}|${cookiePath}|${name}`, { name, value, domain, path: cookiePath })
    }
  }

  header(requestUrl: string): string {
    const url = new URL(requestUrl)
    const pairs: string[] = []
    for (const cookie of this.cookies.values()) {
      if (!hostMatches(url.hostname, cookie.domain)) continue
      if (!url.pathname.startsWith(cookie.path || '/')) continue
      pairs.push(`${cookie.name}=${cookie.value}`)
    }
    return pairs.join('; ')
  }

  snapshot(): string {
    return [...this.cookies.values()].map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  }

  get(name: string): string {
    for (const cookie of this.cookies.values()) {
      if (cookie.name === name) return cookie.value
    }
    return ''
  }

  all(): Array<{ name: string; value: string }> {
    return [...this.cookies.values()].map(({ name, value }) => ({ name, value }))
  }
}

function hostMatches(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase()
  const cookieDomain = domain.replace(/^\./, '').toLowerCase()
  return host === cookieDomain || host.endsWith(`.${cookieDomain}`)
}
