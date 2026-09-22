import type { BrowserContext, BrowserContextOptions } from 'playwright-core'
import {
  SEND_HIGH_ENTROPY_CLIENT_HINTS,
  parseSecChBrands,
  type BrowserProfile,
  type FingerprintSession
} from './browser-fingerprint.js'

export interface FingerprintInjectionProfile {
  userAgent: string
  platform: string
  vendor: string
  language: string
  languages: string[]
  hardwareConcurrency: number
  deviceMemory: number
  devicePixelRatio: number
  screenWidth: number
  screenHeight: number
  screenAvailWidth: number
  screenAvailHeight: number
  innerWidth: number
  innerHeight: number
  outerWidth: number
  outerHeight: number
  colorDepth: number
  jsHeapSizeLimit: number
  chromeMajor: string
  chromeFullVersion: string
  brands: Array<{ brand: string; version: string }>
  fullVersionList: Array<{ brand: string; version: string }>
  userAgentDataPlatform: string
  secChUaPlatformVersion: string
  secChUaArch: string
  secChUaBitness: string
  secChUaModel: string
  webglVendor: string
  webglRenderer: string
}

export function extraHttpHeaders(profile: BrowserProfile): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept-Language': profile.acceptLanguage
  }
  if (!profile.sendClientHints) return headers
  headers['sec-ch-ua'] = profile.secChUa
  headers['sec-ch-ua-mobile'] = profile.secChUaMobile
  headers['sec-ch-ua-platform'] = profile.secChUaPlatform
  if (SEND_HIGH_ENTROPY_CLIENT_HINTS) {
    headers['sec-ch-ua-full-version-list'] = profile.secChUaFullVersionList
    headers['sec-ch-ua-platform-version'] = profile.secChUaPlatformVersion
    headers['sec-ch-ua-arch'] = profile.secChUaArch
    headers['sec-ch-ua-bitness'] = profile.secChUaBitness
    headers['sec-ch-ua-model'] = profile.secChUaModel
  }
  return headers
}

export function playwrightLaunchArgs(locale = 'zh-CN'): string[] {
  const args = [
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    `--lang=${locale}`
  ]
  if (process.env.AUTH_BROWSER_NO_SANDBOX === 'true') args.push('--no-sandbox')
  return args
}

export function playwrightContextOptions(profile: BrowserProfile): BrowserContextOptions {
  return {
    userAgent: profile.userAgent,
    viewport: { width: profile.viewportWidth, height: profile.viewportHeight },
    screen: { width: profile.screenWidth, height: profile.screenHeight },
    deviceScaleFactor: profile.devicePixelRatio,
    locale: profile.navigatorLanguage,
    timezoneId: profile.timezoneIana,
    colorScheme: 'light',
    isMobile: false,
    hasTouch: false,
    extraHTTPHeaders: extraHttpHeaders(profile)
  }
}

export function injectionProfile(profile: BrowserProfile): FingerprintInjectionProfile {
  return {
    userAgent: profile.userAgent,
    platform: profile.navigatorPlatform,
    vendor: profile.navigatorVendor,
    language: profile.navigatorLanguage,
    languages: [...profile.navigatorLanguages],
    hardwareConcurrency: profile.hardwareConcurrency,
    deviceMemory: profile.deviceMemory,
    devicePixelRatio: profile.devicePixelRatio,
    screenWidth: profile.screenWidth,
    screenHeight: profile.screenHeight,
    screenAvailWidth: profile.screenAvailWidth,
    screenAvailHeight: profile.screenAvailHeight,
    innerWidth: profile.viewportWidth,
    innerHeight: profile.viewportHeight,
    outerWidth: profile.outerWidth,
    outerHeight: profile.outerHeight,
    colorDepth: profile.colorDepth,
    jsHeapSizeLimit: profile.jsHeapSizeLimit,
    chromeMajor: profile.chromeMajor,
    chromeFullVersion: profile.chromeFullVersion,
    brands: parseSecChBrands(profile.secChUa, profile.chromeMajor),
    fullVersionList: parseSecChBrands(profile.secChUaFullVersionList, profile.chromeFullVersion),
    userAgentDataPlatform: profile.userAgentDataPlatform,
    secChUaPlatformVersion: profile.secChUaPlatformVersion.replaceAll('"', ''),
    secChUaArch: profile.secChUaArch.replaceAll('"', ''),
    secChUaBitness: profile.secChUaBitness.replaceAll('"', ''),
    secChUaModel: profile.secChUaModel.replaceAll('"', ''),
    webglVendor: profile.webglVendor,
    webglRenderer: profile.webglRenderer
  }
}

export function fingerprintInitScript(profile: FingerprintInjectionProfile): string {
  return `(() => {
  const profile = ${JSON.stringify({
    hardwareConcurrency: profile.hardwareConcurrency,
    deviceMemory: profile.deviceMemory,
    platform: profile.platform,
    languages: profile.languages,
    language: profile.language
  })};
  try { delete Navigator.prototype.webdriver; } catch {}
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      configurable: true,
      enumerable: true,
      get() { return undefined; }
    });
  } catch {}
  const hide = (object, key, value) => {
    try { Object.defineProperty(object, key, { configurable: true, enumerable: true, get: () => value }); } catch {}
  };
  hide(Navigator.prototype, 'platform', profile.platform);
  hide(Navigator.prototype, 'language', profile.language);
  hide(Navigator.prototype, 'languages', Object.freeze([...profile.languages]));
  hide(Navigator.prototype, 'hardwareConcurrency', profile.hardwareConcurrency);
  hide(Navigator.prototype, 'deviceMemory', profile.deviceMemory);
  try {
    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || { id: undefined, connect: function() {}, sendMessage: function() {} };
  } catch {}
  const originalQuery = navigator.permissions && navigator.permissions.query && navigator.permissions.query.bind(navigator.permissions);
  if (originalQuery) {
    navigator.permissions.query = (parameters) => (
      parameters && parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission, onchange: null })
        : originalQuery(parameters)
    );
  }
})();`
}

export async function applyPlaywrightFingerprint(context: BrowserContext, session: FingerprintSession): Promise<void> {
  await context.addInitScript(fingerprintInitScript(injectionProfile(session.profile)))
  const domains = ['.openai.com', '.chatgpt.com']
  await context.addCookies(domains.flatMap((domain) => [
    { name: 'oai-did', value: session.deviceId, domain, path: '/' },
    { name: 'oai-locale', value: session.profile.navigatorLanguage, domain, path: '/' }
  ]))
}
