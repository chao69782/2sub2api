import { createFingerprintSession, fingerprintSummaryText, validateBrowserProfile } from './browser-fingerprint.js'
import { ManualActionRequiredError } from './openai-auth-errors.js'
import { authorizeWithSentinel } from './openai-protocol-auth.js'

export { ManualActionRequiredError }

export class OpenAIAuthDriver {
  private busy = false

  async authorize(input: {
    authUrl: string
    email: string
    password: string
    totpSecret: string
  }): Promise<string> {
    if (this.busy) throw new Error('AUTH_BROWSER_BUSY')
    this.busy = true
    try {
      const fingerprint = createFingerprintSession(input.email, null, 'macOS')
      const issues = validateBrowserProfile(fingerprint.profile)
      if (issues.length) console.warn(`[fingerprint] ${issues.join('; ')}`)
      console.info(`[fingerprint] ${fingerprintSummaryText(fingerprint)}`)
      return await authorizeWithSentinel({
        authUrl: input.authUrl,
        email: input.email,
        password: input.password,
        totpSecret: input.totpSecret,
        session: fingerprint
      })
    } finally {
      this.busy = false
    }
  }
}
