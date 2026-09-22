import { createHash, randomUUID } from 'node:crypto'

export const CHROME_MAJOR = '146'
export const CHROME_FULL_VERSION = '146.0.0.0'
export const SAFARI_WEBKIT_VERSION = '537.36'
export const MAC_OS_UA_VERSION = '10_15_7'

export type HostBrowserOs = 'macOS' | 'Windows' | 'Linux'

export const BROWSER_FAMILY = 'chrome'
export const BROWSER_OS = 'macOS'
export const NAVIGATOR_PLATFORM = 'MacIntel'
export const NAVIGATOR_VENDOR = 'Google Inc.'
export const USER_AGENT_DATA_PLATFORM = 'macOS'

export function hostBrowserOs(): HostBrowserOs {
  if (process.platform === 'darwin') return 'macOS'
  if (process.platform === 'win32') return 'Windows'
  return 'Linux'
}

export const USER_AGENT = (
  `Mozilla/5.0 (Macintosh; Intel Mac OS X ${MAC_OS_UA_VERSION}) ` +
  `AppleWebKit/${SAFARI_WEBKIT_VERSION} (KHTML, like Gecko) ` +
  `Chrome/${CHROME_FULL_VERSION} Safari/${SAFARI_WEBKIT_VERSION}`
)

export const SEC_CH_UA = '"Google Chrome";v="146", "Chromium";v="146", "Not)A;Brand";v="24"'
export const SEC_CH_UA_FULL_VERSION_LIST = '"Google Chrome";v="146.0.0.0", "Chromium";v="146.0.0.0", "Not)A;Brand";v="24.0.0.0"'
export const SEC_CH_UA_PLATFORM = '"macOS"'
export const SEC_CH_UA_PLATFORM_VERSION = '"15.7.0"'
export const SEC_CH_UA_MOBILE = '?0'
export const SEC_CH_UA_ARCH = '"arm"'
export const SEC_CH_UA_BITNESS = '"64"'
export const SEC_CH_UA_MODEL = '""'
export const SEND_HIGH_ENTROPY_CLIENT_HINTS = false

export const SENTINEL_SV = '20260810913b'
export const OPENAI_BUILD_ID = 'prod-d4e40d432de549a66bf9feb61d43c262b258386f'
export const OAI_CLIENT_BUILD_NUMBER = '10762726'
export const OAI_CLIENT_VERSION = OPENAI_BUILD_ID

export const NAVIGATOR_PROTO_SAMPLES = [
  'createAuctionNonce−function createAuctionNonce() { [native code] }',
  'clearOriginJoinedAdInterestGroups−function clearOriginJoinedAdInterestGroups() { [native code] }',
  'updateAdInterestGroups−function updateAdInterestGroups() { [native code] }',
  'canLoadAdAuctionFencedFrame−function canLoadAdAuctionFencedFrame() { [native code] }',
  'gpu−[object GPU]',
  'getBattery−function getBattery() { [native code] }',
  'getGamepads−function getGamepads() { [native code] }',
  'javaEnabled−function javaEnabled() { [native code] }',
  'sendBeacon−function sendBeacon() { [native code] }',
  'vibrate−function vibrate() { [native code] }',
  'login−[object NavigatorLogin]'
]

export const DOCUMENT_KEY_SAMPLES = [
  'currentScript', 'scripts', 'cookie', 'URL', 'documentURI', 'referrer',
  'title', 'characterSet', 'charset', 'compatMode', 'contentType', 'readyState',
  'visibilityState', 'hidden', 'hasFocus', 'documentElement', 'body',
  'addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll',
  'getElementById', 'getElementsByTagName', 'createElement'
]

export const WINDOW_KEY_SAMPLES = [
  'window', 'self', 'top', 'parent', 'frames', 'navigator', 'screen', 'location',
  'localStorage', 'sessionStorage', 'history', 'innerWidth', 'innerHeight',
  'outerWidth', 'outerHeight', 'devicePixelRatio', 'chrome', 'performance', 'crypto',
  'TextEncoder', 'URL', 'URLSearchParams', 'AbortController',
  'locationbar', 'scrollX', 'scrollY', 'ondevicemotion',
  'requestAnimationFrame', 'queueMicrotask', 'onfocus', 'onblur', 'onpageshow'
]

export const SCRIPT_SRC_SAMPLES = [
  'https://accounts.google.com/gsi/client',
  'https://chatgpt.com/cdn-cgi/challenge-platform/scripts/jsd/api.js?onload=jsdOnload',
  `https://sentinel.openai.com/sentinel/${SENTINEL_SV}/sdk.js`
]

export const WINDOW_FEATURE_FLAGS = {
  ai: 0,
  InstallTrigger: 0,
  cache: 0,
  data: 0,
  solana: 0,
  dump: 0,
  requestIdleCallback: 0
}

export const HAR_CAPTURE_BASE_PROFILE = {
  screenWidth: 1680,
  screenHeight: 1050,
  hardwareConcurrency: 6,
  deviceMemory: 8,
  jsHeapSizeLimit: 4_395_630_592,
  devicePixelRatio: 2
}

export const BROWSER_PROFILE_POOL = [
  HAR_CAPTURE_BASE_PROFILE,
  { screenWidth: 1440, screenHeight: 900, hardwareConcurrency: 8, deviceMemory: 8, jsHeapSizeLimit: 4_294_967_296, devicePixelRatio: 2 },
  { screenWidth: 1512, screenHeight: 982, hardwareConcurrency: 8, deviceMemory: 8, jsHeapSizeLimit: 4_294_967_296, devicePixelRatio: 2 },
  { screenWidth: 1680, screenHeight: 1050, hardwareConcurrency: 8, deviceMemory: 8, jsHeapSizeLimit: 4_294_967_296, devicePixelRatio: 2 },
  { screenWidth: 1728, screenHeight: 1117, hardwareConcurrency: 10, deviceMemory: 8, jsHeapSizeLimit: 4_294_967_296, devicePixelRatio: 2 },
  { screenWidth: 1800, screenHeight: 1169, hardwareConcurrency: 10, deviceMemory: 8, jsHeapSizeLimit: 4_294_967_296, devicePixelRatio: 2 },
  { screenWidth: 2056, screenHeight: 1329, hardwareConcurrency: 12, deviceMemory: 8, jsHeapSizeLimit: 4_294_967_296, devicePixelRatio: 2 }
] as const

export const BROWSER_LOCALE_PROFILES = {
  jp: { navigatorLanguage: 'ja-JP', navigatorLanguages: ['ja-JP'], acceptLanguage: 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7', timezoneIana: 'Asia/Tokyo', timezoneOffsetMinutes: 9 * 60, timezoneName: 'Japan Standard Time' },
  cn: { navigatorLanguage: 'zh-CN', navigatorLanguages: ['zh-CN'], acceptLanguage: 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7', timezoneIana: 'Asia/Shanghai', timezoneOffsetMinutes: 8 * 60, timezoneName: 'China Standard Time' },
  us: { navigatorLanguage: 'en-US', navigatorLanguages: ['en-US'], acceptLanguage: 'en-US,en;q=0.9', timezoneIana: 'America/Los_Angeles', timezoneOffsetMinutes: -7 * 60, timezoneName: 'Pacific Daylight Time' },
  sg: { navigatorLanguage: 'en-SG', navigatorLanguages: ['en-SG'], acceptLanguage: 'en-SG,en-US;q=0.9,en;q=0.8', timezoneIana: 'Asia/Singapore', timezoneOffsetMinutes: 8 * 60, timezoneName: 'Singapore Standard Time' },
  hk: { navigatorLanguage: 'zh-HK', navigatorLanguages: ['zh-HK'], acceptLanguage: 'zh-HK,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6', timezoneIana: 'Asia/Hong_Kong', timezoneOffsetMinutes: 8 * 60, timezoneName: 'Hong Kong Standard Time' },
  tw: { navigatorLanguage: 'zh-TW', navigatorLanguages: ['zh-TW'], acceptLanguage: 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7', timezoneIana: 'Asia/Taipei', timezoneOffsetMinutes: 8 * 60, timezoneName: 'Taipei Standard Time' },
  gb: { navigatorLanguage: 'en-GB', navigatorLanguages: ['en-GB'], acceptLanguage: 'en-GB,en-US;q=0.9,en;q=0.8', timezoneIana: 'Europe/London', timezoneOffsetMinutes: 1 * 60, timezoneName: 'British Summer Time' },
  de: { navigatorLanguage: 'de-DE', navigatorLanguages: ['de-DE'], acceptLanguage: 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7', timezoneIana: 'Europe/Berlin', timezoneOffsetMinutes: 2 * 60, timezoneName: 'Central European Summer Time' },
  fr: { navigatorLanguage: 'fr-FR', navigatorLanguages: ['fr-FR'], acceptLanguage: 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7', timezoneIana: 'Europe/Paris', timezoneOffsetMinutes: 2 * 60, timezoneName: 'Central European Summer Time' },
  nl: { navigatorLanguage: 'nl-NL', navigatorLanguages: ['nl-NL'], acceptLanguage: 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7', timezoneIana: 'Europe/Amsterdam', timezoneOffsetMinutes: 2 * 60, timezoneName: 'Central European Summer Time' },
  vn: { navigatorLanguage: 'vi-VN', navigatorLanguages: ['vi-VN', 'vi', 'en-US', 'en'], acceptLanguage: 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7', timezoneIana: 'Asia/Ho_Chi_Minh', timezoneOffsetMinutes: 7 * 60, timezoneName: 'Indochina Time' }
} as const

export type LocaleProfileKey = keyof typeof BROWSER_LOCALE_PROFILES

export const COUNTRY_LOCALE_PROFILE_MAP: Record<string, LocaleProfileKey> = {
  JP: 'jp', CN: 'cn', HK: 'hk', TW: 'tw', US: 'us', CA: 'us',
  SG: 'sg', GB: 'gb', AU: 'gb', DE: 'de', FR: 'fr', NL: 'nl', VN: 'vn'
}

export const COUNTRY_LANGUAGE_TAG_MAP: Record<string, string> = {
  TH: 'th-TH', ID: 'id-ID', MY: 'ms-MY', PH: 'en-PH',
  KR: 'ko-KR', IN: 'en-IN', BR: 'pt-BR', MX: 'es-MX',
  ES: 'es-ES', IT: 'it-IT', PT: 'pt-PT', PL: 'pl-PL',
  RU: 'ru-RU', TR: 'tr-TR', AE: 'ar-AE', SA: 'ar-SA',
  ZA: 'en-ZA', NZ: 'en-NZ', IE: 'en-IE', AT: 'de-AT',
  CH: 'de-CH', BE: 'nl-BE', SE: 'sv-SE', NO: 'nb-NO',
  DK: 'da-DK', FI: 'fi-FI', CZ: 'cs-CZ', RO: 'ro-RO',
  HU: 'hu-HU', GR: 'el-GR', IL: 'he-IL', UA: 'uk-UA'
}

export const TIMEZONE_NAME_BY_IANA: Record<string, string> = {
  'Asia/Tokyo': 'Japan Standard Time',
  'Asia/Shanghai': 'China Standard Time',
  'Asia/Singapore': 'Singapore Standard Time',
  'Asia/Hong_Kong': 'Hong Kong Standard Time',
  'Asia/Taipei': 'Taipei Standard Time',
  'America/Los_Angeles': 'Pacific Daylight Time',
  'America/New_York': 'Eastern Daylight Time',
  'America/Chicago': 'Central Daylight Time',
  'America/Denver': 'Mountain Daylight Time',
  'Europe/London': 'British Summer Time',
  'Europe/Berlin': 'Central European Summer Time',
  'Europe/Paris': 'Central European Summer Time',
  'Europe/Amsterdam': 'Central European Summer Time',
  'Asia/Ho_Chi_Minh': 'Indochina Time',
  'Asia/Bangkok': 'Indochina Time'
}

export interface ExitGeo {
  ip?: string
  country?: string
  region?: unknown
  city?: unknown
  timezone?: string
  org?: unknown
}

export interface BrowserProfile {
  localeProfile: string
  geo: ExitGeo
  timezoneIana: string
  timezoneOffsetMinutes: number
  timezoneName: string
  navigatorLanguage: string
  navigatorLanguages: string[]
  acceptLanguage: string
  browserFamily: string
  browserOs: string
  navigatorPlatform: string
  navigatorVendor: string
  userAgentDataPlatform: string
  safariWebkitVersion: string
  chromeMajor: string
  chromeFullVersion: string
  userAgent: string
  sendClientHints: boolean
  secChUa: string
  secChUaPlatform: string
  secChUaPlatformVersion: string
  secChUaArch: string
  secChUaBitness: string
  secChUaModel: string
  secChUaFullVersionList: string
  secChUaMobile: string
  navigatorProtoSamples: string[]
  documentKeySamples: string[]
  windowKeySamples: string[]
  scriptSrcSamples: string[]
  windowFeatureFlags: Record<string, number>
  buildId: string | null
  screenWidth: number
  screenHeight: number
  hardwareConcurrency: number
  deviceMemory: number
  jsHeapSizeLimit: number
  devicePixelRatio: number
  screenAvailWidth: number
  screenAvailHeight: number
  colorDepth: number
  outerWidth: number
  outerHeight: number
  viewportWidth: number
  viewportHeight: number
  webglVendor: string
  webglRenderer: string
  reactListeningKey?: string
  reactContainerKey?: string
  reactResourcesKey?: string
}

export interface FingerprintSession {
  seed: string
  deviceId: string
  sentinelSid: string
  sentinelIframeSid: string
  oaiSessionId: string
  authSessionLoggingId: string
  reactListeningKey: string
  reactContainerKey: string
  reactResourcesKey: string
  profile: BrowserProfile
}

export interface SecChBrand {
  brand: string
  version: string
}

export function defaultLocaleProfileKey(): LocaleProfileKey {
  const raw = (process.env.AUTH_BROWSER_LOCALE_PROFILE ?? 'cn').trim().toLowerCase()
  return raw in BROWSER_LOCALE_PROFILES ? raw as LocaleProfileKey : 'cn'
}

export function seedUuid(seed: string, salt: string): string {
  const hash = createHash('sha1').update(`openai-auth-workbench:${salt}:${seed}`).digest()
  hash[6] = (hash[6]! & 0x0f) | 0x50
  hash[8] = (hash[8]! & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function seedInt(seed: string, salt: string, bits = 32): number {
  const digest = createHash('sha256').update(`${salt}:${seed}`).digest()
  const nbytes = Math.max(1, Math.ceil(bits / 8))
  const value = digest.subarray(0, nbytes).reduce((acc, byte) => ((acc << 8) | byte) >>> 0, 0)
  const mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1
  return value & mask
}

export function timezoneOffsetMinutes(timeZone: string, fallback: number, date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    )
    return Math.round((asUtc - date.getTime()) / 60_000)
  } catch {
    return fallback
  }
}

export function parseSecChBrands(value: string, major = ''): SecChBrand[] {
  const text = value.trim()
  if (!text) {
    return [
      { brand: 'Not)A;Brand', version: '8' },
      { brand: 'Chromium', version: String(major || '') },
      { brand: 'Google Chrome', version: String(major || '') }
    ]
  }
  const out: SecChBrand[] = []
  const re = /"([^"]+)"\s*;\s*v="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) out.push({ brand: match[1]!, version: match[2]! })
  if (out.length) return out
  return text.split(',').map((part) => ({ brand: part.trim(), version: String(major || '') })).filter((item) => item.brand)
}

function chromeClientHints(major: string, fullVersion: string, os: HostBrowserOs = 'macOS') {
  const ua = os === 'Windows'
    ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/${SAFARI_WEBKIT_VERSION} (KHTML, like Gecko) Chrome/${fullVersion} Safari/${SAFARI_WEBKIT_VERSION}`
    : os === 'Linux'
      ? `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/${SAFARI_WEBKIT_VERSION} (KHTML, like Gecko) Chrome/${fullVersion} Safari/${SAFARI_WEBKIT_VERSION}`
      : `Mozilla/5.0 (Macintosh; Intel Mac OS X ${MAC_OS_UA_VERSION}) AppleWebKit/${SAFARI_WEBKIT_VERSION} (KHTML, like Gecko) Chrome/${fullVersion} Safari/${SAFARI_WEBKIT_VERSION}`
  return {
    userAgent: ua,
    secChUa: `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not)A;Brand";v="24"`,
    secChUaFullVersionList: `"Google Chrome";v="${fullVersion}", "Chromium";v="${fullVersion}", "Not)A;Brand";v="24.0.0.0"`
  }
}

function osFingerprint(os: HostBrowserOs, cores: number) {
  if (os === 'Windows') {
    return {
      browserOs: 'Windows' as const,
      navigatorPlatform: 'Win32',
      userAgentDataPlatform: 'Windows',
      secChUaPlatform: '"Windows"',
      secChUaPlatformVersion: '"15.0.0"',
      secChUaArch: '"x86"',
      webglVendor: 'Google Inc. (NVIDIA)',
      webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)'
    }
  }
  if (os === 'Linux') {
    return {
      browserOs: 'Linux' as const,
      navigatorPlatform: 'Linux x86_64',
      userAgentDataPlatform: 'Linux',
      secChUaPlatform: '"Linux"',
      secChUaPlatformVersion: '"6.8.0"',
      secChUaArch: '"x86"',
      webglVendor: 'Google Inc. (Google)',
      webglRenderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'
    }
  }
  const chip = cores >= 12 ? 'Apple M2 Max' : cores >= 10 ? 'Apple M2 Pro' : 'Apple M2'
  return {
    browserOs: 'macOS' as const,
    navigatorPlatform: 'MacIntel',
    userAgentDataPlatform: 'macOS',
    secChUaPlatform: '"macOS"',
    secChUaPlatformVersion: SEC_CH_UA_PLATFORM_VERSION,
    secChUaArch: '"arm"',
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: `ANGLE (Apple, ANGLE Metal Renderer: ${chip}, Unspecified Version)`
  }
}

export function normalizeChromeVersion(version: string | undefined, fallbackFull = CHROME_FULL_VERSION): { major: string; full: string } {
  const text = String(version || '').trim()
  const match = text.match(/^(\d+)(?:\.(\d+)\.(\d+)\.(\d+))?/)
  if (!match) {
    const fallbackMajor = fallbackFull.split('.')[0] || CHROME_MAJOR
    return { major: fallbackMajor, full: fallbackFull }
  }
  const major = match[1]!
  const full = match[2] !== undefined ? `${major}.${match[2]}.${match[3]}.${match[4]}` : `${major}.0.0.0`
  return { major, full }
}

function localeFromGeo(geo?: ExitGeo | null): {
  localeProfile: string
  navigatorLanguage: string
  navigatorLanguages: string[]
  acceptLanguage: string
  timezoneIana: string
  timezoneOffsetMinutes: number
  timezoneName: string
} {
  const fallbackKey = defaultLocaleProfileKey()
  const country = String(geo?.country || '').toUpperCase()
  const mapped = country ? COUNTRY_LOCALE_PROFILE_MAP[country] : undefined
  const key = mapped ?? fallbackKey
  const base = BROWSER_LOCALE_PROFILES[key]
  const locale: {
    localeProfile: string
    navigatorLanguage: string
    navigatorLanguages: string[]
    acceptLanguage: string
    timezoneIana: string
    timezoneOffsetMinutes: number
    timezoneName: string
  } = {
    localeProfile: mapped ?? fallbackKey,
    navigatorLanguage: base.navigatorLanguage,
    navigatorLanguages: [...base.navigatorLanguages],
    acceptLanguage: base.acceptLanguage,
    timezoneIana: base.timezoneIana,
    timezoneOffsetMinutes: base.timezoneOffsetMinutes,
    timezoneName: base.timezoneName
  }
  if (!geo) return locale
  if (!mapped && country) {
    const languageTag = COUNTRY_LANGUAGE_TAG_MAP[country] ?? 'en-US'
    locale.localeProfile = `geo:${country.toLowerCase()}`
    const baseLanguage = languageTag.split('-')[0]!
    const languages = [languageTag]
    if (baseLanguage !== languageTag) languages.push(baseLanguage)
    if (baseLanguage !== 'en') {
      languages.push('en-US', 'en')
      locale.acceptLanguage = `${languageTag},${baseLanguage};q=0.9,en-US;q=0.8,en;q=0.7`
    } else {
      languages.push('en')
      locale.acceptLanguage = `${languageTag},en;q=0.9`
    }
    locale.navigatorLanguage = languageTag
    locale.navigatorLanguages = [...new Set(languages)]
  }
  const tz = String(geo.timezone || '').trim()
  if (tz) {
    locale.timezoneIana = tz
    locale.timezoneOffsetMinutes = timezoneOffsetMinutes(tz, locale.timezoneOffsetMinutes)
    locale.timezoneName = TIMEZONE_NAME_BY_IANA[tz] ?? locale.timezoneName
  }
  return locale
}

export function buildBrowserEnvironment(
  geo?: ExitGeo | null,
  baseProfile?: Partial<BrowserProfile> | typeof BROWSER_PROFILE_POOL[number],
  os: HostBrowserOs = hostBrowserOs()
): BrowserProfile {
  const locale = localeFromGeo(geo)
  const picked = baseProfile ?? BROWSER_PROFILE_POOL[Math.floor(Math.random() * BROWSER_PROFILE_POOL.length)]!
  const screenWidth = Number(picked.screenWidth ?? HAR_CAPTURE_BASE_PROFILE.screenWidth)
  const screenHeight = Number(picked.screenHeight ?? HAR_CAPTURE_BASE_PROFILE.screenHeight)
  const hardwareConcurrency = Number(picked.hardwareConcurrency ?? 8)
  const osFields = osFingerprint(os, hardwareConcurrency)
  const hints = chromeClientHints(CHROME_MAJOR, CHROME_FULL_VERSION, os)
  const screenAvailWidth = Number(('screenAvailWidth' in picked && picked.screenAvailWidth) || screenWidth)
  const screenAvailHeight = Number(('screenAvailHeight' in picked && picked.screenAvailHeight) || Math.max(0, screenHeight - 25))
  const outerWidth = Number(('outerWidth' in picked && picked.outerWidth) || screenAvailWidth)
  const outerHeight = Number(('outerHeight' in picked && picked.outerHeight) || screenAvailHeight)
  const viewportWidth = Number(('viewportWidth' in picked && picked.viewportWidth) || outerWidth)
  const viewportHeight = Number(('viewportHeight' in picked && picked.viewportHeight) || Math.max(0, outerHeight - 87))

  return {
    localeProfile: locale.localeProfile,
    geo: { ...(geo ?? {}) },
    timezoneIana: locale.timezoneIana,
    timezoneOffsetMinutes: locale.timezoneOffsetMinutes,
    timezoneName: locale.timezoneName,
    navigatorLanguage: locale.navigatorLanguage,
    navigatorLanguages: [...locale.navigatorLanguages],
    acceptLanguage: locale.acceptLanguage,
    browserFamily: BROWSER_FAMILY,
    browserOs: osFields.browserOs,
    navigatorPlatform: osFields.navigatorPlatform,
    navigatorVendor: NAVIGATOR_VENDOR,
    userAgentDataPlatform: osFields.userAgentDataPlatform,
    safariWebkitVersion: SAFARI_WEBKIT_VERSION,
    chromeMajor: CHROME_MAJOR,
    chromeFullVersion: CHROME_FULL_VERSION,
    userAgent: hints.userAgent,
    sendClientHints: true,
    secChUa: hints.secChUa,
    secChUaPlatform: osFields.secChUaPlatform,
    secChUaPlatformVersion: osFields.secChUaPlatformVersion,
    secChUaArch: osFields.secChUaArch,
    secChUaBitness: SEC_CH_UA_BITNESS,
    secChUaModel: SEC_CH_UA_MODEL,
    secChUaFullVersionList: hints.secChUaFullVersionList,
    secChUaMobile: SEC_CH_UA_MOBILE,
    navigatorProtoSamples: [...NAVIGATOR_PROTO_SAMPLES],
    documentKeySamples: [...DOCUMENT_KEY_SAMPLES],
    windowKeySamples: [...WINDOW_KEY_SAMPLES],
    scriptSrcSamples: [...SCRIPT_SRC_SAMPLES],
    windowFeatureFlags: { ...WINDOW_FEATURE_FLAGS },
    buildId: null,
    screenWidth,
    screenHeight,
    hardwareConcurrency,
    deviceMemory: Number(picked.deviceMemory ?? 8),
    jsHeapSizeLimit: Number(picked.jsHeapSizeLimit ?? HAR_CAPTURE_BASE_PROFILE.jsHeapSizeLimit),
    devicePixelRatio: Number(picked.devicePixelRatio ?? 2),
    screenAvailWidth,
    screenAvailHeight,
    colorDepth: 24,
    outerWidth,
    outerHeight,
    viewportWidth,
    viewportHeight,
    webglVendor: osFields.webglVendor,
    webglRenderer: osFields.webglRenderer
  }
}

export function applyChromeVersion(profile: BrowserProfile, version: string | undefined): BrowserProfile {
  const { major, full } = normalizeChromeVersion(version, profile.chromeFullVersion)
  const os: HostBrowserOs = profile.browserOs === 'Windows' || profile.browserOs === 'Linux' ? profile.browserOs : 'macOS'
  const hints = chromeClientHints(major, full, os)
  return {
    ...profile,
    chromeMajor: major,
    chromeFullVersion: full,
    userAgent: hints.userAgent,
    secChUa: hints.secChUa,
    secChUaFullVersionList: hints.secChUaFullVersionList
  }
}

export function pickBrowserProfile(seed?: string, geo?: ExitGeo | null, os: HostBrowserOs = hostBrowserOs()): BrowserProfile {
  if (!seed) return buildBrowserEnvironment(geo, undefined, os)
  const index = seedInt(seed, 'browser_profile_index', 32) % BROWSER_PROFILE_POOL.length
  return buildBrowserEnvironment(geo, BROWSER_PROFILE_POOL[index], os)
}

export function validateBrowserProfile(profile: BrowserProfile): string[] {
  const issues: string[] = []
  const ua = profile.userAgent
  if (!ua.includes(`Chrome/${profile.chromeFullVersion}`)) issues.push('UA 与 chromeFullVersion 不一致')
  if (profile.browserOs === 'macOS') {
    if (!ua.includes('Macintosh; Intel Mac OS X')) issues.push('macOS 画像但 UA 不是 Macintosh')
    if (profile.navigatorPlatform !== 'MacIntel') issues.push('macOS 画像但 navigator.platform 不是 MacIntel')
    if (!profile.secChUaPlatform.includes('macOS')) issues.push('macOS 画像但 sec-ch-ua-platform 不是 macOS')
  }
  if (profile.browserOs === 'Linux') {
    if (!ua.includes('Linux')) issues.push('Linux 画像但 UA 不是 Linux')
    if (!profile.navigatorPlatform.includes('Linux')) issues.push('Linux 画像但 navigator.platform 不是 Linux')
    if (!profile.secChUaPlatform.includes('Linux')) issues.push('Linux 画像但 sec-ch-ua-platform 不是 Linux')
  }
  if (profile.browserOs === 'Windows') {
    if (!ua.includes('Windows NT')) issues.push('Windows 画像但 UA 不是 Windows')
    if (profile.navigatorPlatform !== 'Win32') issues.push('Windows 画像但 navigator.platform 不是 Win32')
    if (!profile.secChUaPlatform.includes('Windows')) issues.push('Windows 画像但 sec-ch-ua-platform 不是 Windows')
  }
  if (!profile.navigatorLanguage) issues.push('navigatorLanguage 为空')
  if (profile.navigatorLanguage && !profile.navigatorLanguages.includes(profile.navigatorLanguage)) {
    issues.push('navigator.language 不在 navigator.languages 中')
  }
  return issues
}

export function createFingerprintSession(seed?: string, geo?: ExitGeo | null, os: HostBrowserOs = hostBrowserOs()): FingerprintSession {
  const resolvedSeed = seed?.trim() || randomUUID()
  const deviceId = seed ? seedUuid(resolvedSeed, 'device_id') : randomUUID()
  const sentinelSid = seed ? seedUuid(resolvedSeed, 'sentinel_sid') : randomUUID()
  const sentinelIframeSid = seed ? seedUuid(resolvedSeed, 'sentinel_iframe_sid') : randomUUID()
  const oaiSessionId = seed ? seedUuid(resolvedSeed, 'oai_session_id') : randomUUID()
  const authSessionLoggingId = seed ? seedUuid(resolvedSeed, 'auth_session_logging_id') : randomUUID()
  const reactListeningKey = '_reactListening' + (seed ? seedUuid(resolvedSeed, 'react_listening_key') : randomUUID()).replaceAll('-', '').slice(0, 12)
  const reactContainerKey = '__reactContainer$' + (seed ? seedUuid(resolvedSeed, 'react_container_key') : randomUUID()).replaceAll('-', '').slice(0, 11)
  const reactResourcesKey = '__reactResources$' + reactContainerKey.split('$', 2)[1]
  const profile = pickBrowserProfile(seed, geo, os)
  profile.reactListeningKey = reactListeningKey
  profile.reactContainerKey = reactContainerKey
  profile.reactResourcesKey = reactResourcesKey
  return {
    seed: resolvedSeed,
    deviceId,
    sentinelSid,
    sentinelIframeSid,
    oaiSessionId,
    authSessionLoggingId,
    reactListeningKey,
    reactContainerKey,
    reactResourcesKey,
    profile
  }
}

export function fingerprintSummaryText(session: FingerprintSession): string {
  const profile = session.profile
  return [
    `device_id=${session.deviceId.slice(0, 12)}`,
    `ua=${profile.userAgent.slice(0, 72)}`,
    `lang=${profile.acceptLanguage}`,
    `tz=${profile.timezoneIana}(${profile.timezoneOffsetMinutes})`,
    `screen=${profile.screenWidth}x${profile.screenHeight}@${profile.devicePixelRatio}`,
    `cpu=${profile.hardwareConcurrency}`,
    `mem=${profile.deviceMemory}`
  ].join(' ')
}
