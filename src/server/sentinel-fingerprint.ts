import {
  DOCUMENT_KEY_SAMPLES,
  NAVIGATOR_PROTO_SAMPLES,
  SENTINEL_SV,
  USER_AGENT,
  WINDOW_FEATURE_FLAGS,
  WINDOW_KEY_SAMPLES,
  type BrowserProfile
} from './browser-fingerprint.js'

export type SentinelConfig = Array<string | number | null>

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatFingerprintDate(date: Date, timezoneOffsetMinutes: number, timezoneName: string): string {
  const local = new Date(date.getTime() + timezoneOffsetMinutes * 60_000)
  const sign = timezoneOffsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(timezoneOffsetMinutes)
  const gmt = `GMT${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`
  const day = String(local.getUTCDate()).padStart(2, '0')
  const hours = String(local.getUTCHours()).padStart(2, '0')
  const minutes = String(local.getUTCMinutes()).padStart(2, '0')
  const seconds = String(local.getUTCSeconds()).padStart(2, '0')
  return `${WEEKDAYS[local.getUTCDay()]} ${MONTHS[local.getUTCMonth()]} ${day} ${local.getUTCFullYear()} ${hours}:${minutes}:${seconds} ${gmt} (${timezoneName})`
}

function pick<T>(items: T[], random = Math.random): T {
  return items[Math.floor(random() * items.length)]!
}

export function generateFingerprintData(
  deviceId: string,
  attempt = 1,
  elapsedMs = 0,
  profile?: Partial<BrowserProfile>,
  random = Math.random
): SentinelConfig {
  const screenWidth = Number(profile?.screenWidth ?? 1680)
  const screenHeight = Number(profile?.screenHeight ?? 1050)
  const jsHeapSizeLimit = Number(profile?.jsHeapSizeLimit ?? 4_395_630_592)
  const hardwareConcurrency = Number(profile?.hardwareConcurrency ?? 6)
  const navigatorLanguage = String(profile?.navigatorLanguage ?? 'zh-CN')
  const navigatorLanguages = profile?.navigatorLanguages ?? [navigatorLanguage]
  const userAgent = String(profile?.userAgent ?? USER_AGENT)
  const buildId = profile && 'buildId' in profile ? profile.buildId ?? null : null
  const reactListeningKey = profile?.reactListeningKey || ('_reactListening' + Math.random().toString(36).slice(2, 13))
  const reactContainerKey = profile?.reactContainerKey || ('__reactContainer$' + Math.random().toString(36).slice(2, 13))
  const reactResourcesKey = profile?.reactResourcesKey || reactContainerKey.replace('__reactContainer$', '__reactResources$')
  const tzOffset = Number(profile?.timezoneOffsetMinutes ?? 8 * 60)
  const tzName = String(profile?.timezoneName ?? 'China Standard Time')
  const perfNow = 1000 + random() * 7000
  const timeOrigin = Date.now() - perfNow
  const navigatorProps = profile?.navigatorProtoSamples ?? NAVIGATOR_PROTO_SAMPLES
  const documentKeys = profile?.documentKeySamples ?? DOCUMENT_KEY_SAMPLES
  const windowKeys = profile?.windowKeySamples ?? WINDOW_KEY_SAMPLES
  const windowFlags = { ...WINDOW_FEATURE_FLAGS, ...(profile?.windowFeatureFlags ?? {}) }
  const scriptSrcSamples = profile?.scriptSrcSamples ?? [`https://sentinel.openai.com/sentinel/${SENTINEL_SV}/sdk.js`]

  return [
    screenWidth + screenHeight,
    formatFingerprintDate(new Date(), tzOffset, tzName),
    jsHeapSizeLimit,
    attempt,
    userAgent,
    pick(scriptSrcSamples, random),
    buildId,
    navigatorLanguage,
    navigatorLanguages.join(','),
    elapsedMs ? Math.round(elapsedMs) : Math.max(1, Math.floor(random() * 100) + 1),
    pick(navigatorProps, random),
    pick([...documentKeys, reactListeningKey, reactContainerKey, reactResourcesKey], random),
    pick(windowKeys, random),
    Number(perfNow.toFixed(10)),
    deviceId,
    '',
    hardwareConcurrency,
    Math.round(timeOrigin * 10) / 10,
    Number(windowFlags.ai ?? 0),
    Number(windowFlags.InstallTrigger ?? 0),
    Number(windowFlags.cache ?? 0),
    Number(windowFlags.data ?? 0),
    Number(windowFlags.solana ?? 0),
    Number(windowFlags.dump ?? 0),
    Number(windowFlags.requestIdleCallback ?? 0)
  ]
}

export function encodeConfig(config: SentinelConfig): string {
  return Buffer.from(JSON.stringify(config), 'utf8').toString('base64')
}

export function decodeConfig(encoded: string): SentinelConfig {
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as SentinelConfig
}

function imul(a: number, b: number): number {
  return Math.imul(a >>> 0, b >>> 0) >>> 0
}

export function fnv1aHash(text: string): string {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = imul(hash, 16777619)
  }
  hash ^= hash >>> 16
  hash = imul(hash, 2246822507)
  hash ^= hash >>> 13
  hash = imul(hash, 3266489909)
  hash ^= hash >>> 16
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function generateRequirementsToken(deviceId: string, profile?: Partial<BrowserProfile>): string {
  return `gAAAAAC${encodeConfig(generateFingerprintData(deviceId, 1, 0, profile))}~S`
}

export function solveProofOfWork(
  seed: string,
  difficulty: string,
  deviceId: string,
  maxAttempts = 500_000,
  profile?: Partial<BrowserProfile>
): string {
  const started = Date.now()
  const config = generateFingerprintData(deviceId, 0, 0, profile)
  const diffLen = difficulty.length
  for (let i = 0; i < maxAttempts; i++) {
    config[3] = i
    config[9] = Date.now() - started
    const encoded = encodeConfig(config)
    if (fnv1aHash(seed + encoded).slice(0, diffLen) <= difficulty) return `${encoded}~S`
  }
  return `wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D${encodeConfig(['e'])}`
}

export function getEnforcementToken(
  sentinelResponse: { proofofwork?: { required?: boolean; seed?: string; difficulty?: string } },
  deviceId: string,
  profile?: Partial<BrowserProfile>
): string {
  const pow = sentinelResponse.proofofwork
  if (pow?.required) {
    return `gAAAAAB${solveProofOfWork(pow.seed ?? '', pow.difficulty ?? '', deviceId, 500_000, profile)}`
  }
  return generateRequirementsToken(deviceId, profile)
}

export function buildSentinelRequestBody(p: string, deviceId: string, flow: string): string {
  return JSON.stringify({ p, id: deviceId, flow })
}

export function buildSentinelTokenHeader(
  p: string,
  turnstileToken: string,
  sentinelToken: string,
  deviceId: string,
  flow: string
): string {
  return JSON.stringify({
    p,
    t: turnstileToken || '',
    c: sentinelToken,
    id: deviceId,
    flow
  })
}
