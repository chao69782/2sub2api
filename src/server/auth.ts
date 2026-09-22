import crypto from 'node:crypto'
import { verify } from '@node-rs/argon2'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { CookieSerializeOptions } from '@fastify/cookie'
import type { AppConfig } from './config.js'
import { randomToken, sha256 } from './crypto.js'
import type { WorkbenchDatabase } from './db.js'

const now = () => new Date()

interface AuthState {
  username: string
  failed_attempts: number
  locked_until: string | null
  session_version: number
}

interface SessionRow {
  username: string
  csrf_token: string
  session_version: number
  created_at: string
  last_seen_at: string
  expires_at: string
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { username: string; csrfToken: string }
  }
}

export class AuthService {
  constructor(private readonly db: WorkbenchDatabase, private readonly config: AppConfig) {
    const timestamp = new Date().toISOString()
    db.prepare(`
      INSERT INTO auth_runtime_state(username, updated_at) VALUES (?, ?)
      ON CONFLICT(username) DO NOTHING
    `).run(config.auth.username, timestamp)
  }

  async login(username: string, password: string, sourceIp: string): Promise<{ token: string; csrfToken: string }> {
    const state = this.getState()
    if (state.locked_until && new Date(state.locked_until) > now()) throw new Error('LOGIN_LOCKED')

    const usernameMatches = crypto.timingSafeEqual(
      Buffer.from(username.padEnd(64, '\0').slice(0, 64)),
      Buffer.from(this.config.auth.username.padEnd(64, '\0').slice(0, 64))
    )
    const passwordMatches = await this.verifyPassword(password)
    if (!usernameMatches || !passwordMatches) {
      this.recordFailure(state)
      throw new Error('INVALID_CREDENTIALS')
    }

    const created = now()
    const token = randomToken()
    const csrfToken = randomToken(24)
    const expires = this.config.auth.session_absolute_hours === 0
      ? new Date('9999-12-31T23:59:59.000Z')
      : new Date(created.getTime() + this.config.auth.session_absolute_hours * 60 * 60_000)
    const transaction = this.db.transaction(() => {
      this.db.prepare(`UPDATE auth_runtime_state SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE username = ?`)
        .run(created.toISOString(), created.toISOString(), this.config.auth.username)
      this.db.prepare(`
        INSERT INTO sessions(token_hash, username, csrf_token, session_version, source_ip, created_at, last_seen_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sha256(token), this.config.auth.username, csrfToken, state.session_version, sourceIp, created.toISOString(), created.toISOString(), expires.toISOString())
    })
    transaction()
    return { token, csrfToken }
  }

  authenticate(request: FastifyRequest): { username: string; csrfToken: string } | null {
    const raw = request.cookies.workbench_session
    if (!raw) return null
    const unsigned = request.unsignCookie(raw)
    if (!unsigned.valid || !unsigned.value) return null
    const session = this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(unsigned.value)) as SessionRow | undefined
    if (!session) return null
    const timestamp = now()
    const state = this.getState()
    const idleLimit = this.config.auth.session_idle_minutes * 60_000
    if (
      session.session_version !== state.session_version ||
      (this.config.auth.session_absolute_hours > 0 && new Date(session.expires_at) <= timestamp) ||
      (this.config.auth.session_idle_minutes > 0 && timestamp.getTime() - new Date(session.last_seen_at).getTime() > idleLimit)
    ) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(unsigned.value))
      return null
    }
    this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(timestamp.toISOString(), sha256(unsigned.value))
    return { username: session.username, csrfToken: session.csrf_token }
  }

  logout(request: FastifyRequest): void {
    const raw = request.cookies.workbench_session
    if (!raw) return
    const unsigned = request.unsignCookie(raw)
    if (unsigned.valid && unsigned.value) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(unsigned.value))
  }

  setSessionCookie(reply: FastifyReply, token: string): void {
    const options: CookieSerializeOptions = {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.server.cookie_secure,
      signed: true
    }
    if (this.config.auth.session_absolute_hours > 0) Object.assign(options, { maxAge: this.config.auth.session_absolute_hours * 60 * 60 })
    reply.setCookie('workbench_session', token, options)
  }

  private getState(): AuthState {
    return this.db.prepare('SELECT * FROM auth_runtime_state WHERE username = ?').get(this.config.auth.username) as AuthState
  }

  private async verifyPassword(password: string): Promise<boolean> {
    if (this.config.auth.password_hash) {
      try { return await verify(this.config.auth.password_hash, password) } catch { return false }
    }
    const expected = Buffer.from(this.config.adminPassword ?? '')
    const actual = Buffer.from(password)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  }

  private recordFailure(state: AuthState): void {
    const failures = state.failed_attempts + 1
    const lockedUntil = failures >= this.config.auth.max_failed_attempts
      ? new Date(Date.now() + this.config.auth.lockout_minutes * 60_000).toISOString()
      : null
    this.db.prepare(`UPDATE auth_runtime_state SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE username = ?`)
      .run(failures, lockedUntil, new Date().toISOString(), this.config.auth.username)
  }
}
