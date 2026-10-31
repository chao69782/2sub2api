import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SecretCipher } from './crypto.js'
import { openDatabase, type WorkbenchDatabase } from './db.js'
import { AccountRepository, JobRepository } from './repositories.js'

const cleanup: Array<() => void> = []

function testDatabase(): { db: WorkbenchDatabase; directory: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-workbench-'))
  const db = openDatabase(directory)
  cleanup.push(() => {
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return { db, directory }
}

afterEach(() => {
  while (cleanup.length) cleanup.pop()?.()
})

describe('AccountRepository', () => {
  it('keeps the saved-secret checkpoint for retries and starts a new rotation after completion', () => {
    const { db } = testDatabase()
    const repository = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 7)))
    const jobs = new JobRepository(db)
    const account = repository.create({ email: 'resume@example.com', password: 'password', totpSecret: 'JBSWY3DPEHPK3PXP' })
    const first = jobs.enqueue({ accountId: account.id, type: 'rotate_totp', payload: { step: 'login' } })
    jobs.markTotpRotationSecretSaved(first.id)
    jobs.setTotpRotationStep(first.id, 'logout_devices')
    jobs.fail(first, 'NETWORK_ERROR', '请求超时', new Date(Date.now() + 1000).toISOString())
    expect(jobs.get(first.id)).toMatchObject({ status: 'pending', payload: { secretSaved: true, step: 'logout_devices' } })
    jobs.fail(first, 'LOGOUT_FAILED', '退出失败')
    const resumed = jobs.enqueue({ accountId: account.id, type: 'rotate_totp', payload: { step: 'login' } })
    expect(resumed.id).not.toBe(first.id)
    expect(resumed.payload).toMatchObject({ secretSaved: true, step: 'login' })
    jobs.complete(resumed.id)
    expect(jobs.enqueue({ accountId: account.id, type: 'rotate_totp', payload: { step: 'login' } }).payload).toEqual({ step: 'login' })
  })

  it('persists rotation steps and tracks the linked import rather than a later authorization', () => {
    const { db } = testDatabase()
    const repository = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 7)))
    const jobs = new JobRepository(db)
    const account = repository.create({ email: 'steps@example.com', password: 'password', totpSecret: 'JBSWY3DPEHPK3PXP' })
    const rotation = jobs.enqueue({ accountId: account.id, type: 'rotate_totp', payload: { step: 'login', source: 'manual' } })
    expect(repository.get(account.id)).toMatchObject({ totpRotationStatus: 'pending', totpRotationStep: 'login', totpRotationImportStatus: null })
    jobs.claimNext('steps-worker')
    jobs.setTotpRotationStep(rotation.id, 'logout_devices')
    expect(repository.get(account.id)).toMatchObject({ totpRotationStatus: 'running', totpRotationStep: 'logout_devices' })
    const imported = jobs.enqueue({ accountId: account.id, type: 'authorize' })
    jobs.setTotpRotationStep(rotation.id, 'import_sub2api', imported.id)
    jobs.complete(rotation.id)
    expect(jobs.get(rotation.id)?.payload).toMatchObject({ source: 'manual', step: 'import_sub2api', authorizationJobId: imported.id })
    expect(repository.get(account.id)).toMatchObject({ totpRotationStatus: 'completed', totpRotationStep: 'import_sub2api', totpRotationImportStatus: 'pending' })
    jobs.complete(imported.id)
    jobs.enqueue({ accountId: account.id, type: 'authorize' })
    expect(repository.get(account.id)).toMatchObject({ totpRotationStatus: 'completed', totpRotationImportStatus: 'completed', totpRotationImportError: null })
  })

  it('stores passwords and TOTP seeds as AES-GCM ciphertext', () => {
    const { db } = testDatabase()
    const repository = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 7)))
    const account = repository.create({
      email: 'owner@example.com',
      password: 'correct horse battery staple',
      totpSecret: 'JBSWY3DPEHPK3PXP'
    })

    const rows = db.prepare('SELECT ciphertext FROM secret_blobs ORDER BY kind').all() as Array<{ ciphertext: Buffer }>
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => !row.ciphertext.toString('utf8').includes('correct horse'))).toBe(true)
    expect(rows.every((row) => !row.ciphertext.toString('utf8').includes('JBSWY3DPEHPK3PXP'))).toBe(true)
    expect(repository.getSecrets(account.id)).toEqual({
      password: 'correct horse battery staple',
      totpSecret: 'JBSWY3DPEHPK3PXP'
    })
  })

  it('keeps the old TOTP secret active until a staged replacement is promoted', () => {
    const { db } = testDatabase()
    const repository = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 7)))
    const account = repository.create({ email: 'rotate@example.com', password: 'password', totpSecret: 'JBSWY3DPEHPK3PXP' })
    repository.stageTotpSecret(account.id, 'JBSWY3DPEHPK3PXPJBSWY3DP')
    expect(repository.getSecrets(account.id).totpSecret).toBe('JBSWY3DPEHPK3PXP')
    expect(repository.getPendingTotpSecret(account.id)).toBe('JBSWY3DPEHPK3PXPJBSWY3DP')
    expect(db.prepare('SELECT COUNT(*) AS count FROM secret_blobs').get()).toEqual({ count: 3 })
    const updated = repository.promoteStagedTotpSecret(account.id)
    expect(updated.totpRotatedAt).toBeTruthy()
    expect(repository.getSecrets(account.id).totpSecret).toBe('JBSWY3DPEHPK3PXPJBSWY3DP')
    expect(repository.getPendingTotpSecret(account.id)).toBeNull()
    expect(db.prepare('SELECT COUNT(*) AS count FROM secret_blobs').get()).toEqual({ count: 2 })
  })

  it('persists and clears account-specific Sub2API import settings', () => {
    const { db } = testDatabase()
    const repository = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 5)))
    const account = repository.create({ email: 'custom@example.com', password: 'password', totpSecret: 'JBSWY3DPEHPK3PXP' })
    const importOverrides = {
      modelWhitelist: ['gpt-5.6-luna'], modelMapping: { 'account-alias': 'gpt-5.6-luna' }, concurrency: 7, priority: 88, groupIds: [2, 3],
      loadFactor: 4, autoPauseOnExpired: false, proxyPolicy: 'direct' as const, fixedProxyId: null
    }

    expect(repository.update(account.id, { importOverrides }).importOverrides).toEqual(importOverrides)
    expect(repository.get(account.id)?.importOverrides?.modelMapping).toEqual(importOverrides.modelMapping)
    expect(repository.update(account.id, { importOverrides: null }).importOverrides).toBeNull()
  })

  it('reads legacy account import settings with an empty model mapping', () => {
    const { db } = testDatabase()
    const repository = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 5)))
    const account = repository.create({ email: 'legacy-mapping@example.com', password: 'password', totpSecret: 'JBSWY3DPEHPK3PXP' })
    db.prepare('UPDATE managed_accounts SET import_overrides_json = ? WHERE id = ?').run(JSON.stringify({
      modelWhitelist: ['gpt-5.6-luna'], concurrency: 7, priority: 88, groupIds: [],
      loadFactor: null, autoPauseOnExpired: true, proxyPolicy: 'direct', fixedProxyId: null
    }), account.id)
    expect(repository.get(account.id)?.importOverrides?.modelMapping).toEqual({})
  })

  it('migrates legacy authorization policies to managed login', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-workbench-policy-'))
    let db = openDatabase(directory)
    const repository = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 9)))
    const account = repository.create({ email: 'legacy@example.com', password: 'password', totpSecret: 'JBSWY3DPEHPK3PXP' })
    db.prepare("UPDATE managed_accounts SET auth_policy = 'manual_only' WHERE id = ?").run(account.id)
    db.close()

    db = openDatabase(directory)
    const row = db.prepare('SELECT auth_policy FROM managed_accounts WHERE id = ?').get(account.id) as { auth_policy: string }
    expect(row.auth_policy).toBe('managed_login')
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('purges legacy soft-deleted accounts and their encrypted secrets on startup', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-workbench-delete-migration-'))
    let db = openDatabase(directory)
    const repository = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 6)))
    const account = repository.create({ email: 'deleted@example.com', password: 'password', totpSecret: 'JBSWY3DPEHPK3PXP' })
    db.prepare('UPDATE managed_accounts SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), account.id)
    db.close()

    db = openDatabase(directory)
    expect(db.prepare('SELECT COUNT(*) AS count FROM managed_accounts').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM secret_blobs').get()).toEqual({ count: 0 })
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('physically deletes the account, encrypted secrets, and related records', () => {
    const { db } = testDatabase()
    const repository = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 8)))
    const account = repository.create({
      email: 'delete@example.com',
      password: 'password',
      totpSecret: 'JBSWY3DPEHPK3PXP'
    })
    new JobRepository(db).enqueue({ accountId: account.id, type: 'authorize' })
    db.prepare(`
      INSERT INTO health_checks(id, account_id, status, summary, checked_at)
      VALUES ('health-delete', ?, 'healthy', '', ?)
    `).run(account.id, new Date().toISOString())

    repository.hardDelete(account.id)

    expect(db.prepare('SELECT COUNT(*) AS count FROM managed_accounts WHERE id = ?').get(account.id)).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM secret_blobs').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM jobs WHERE account_id = ?').get(account.id)).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM health_checks WHERE account_id = ?').get(account.id)).toEqual({ count: 0 })
  })
})

describe('JobRepository', () => {
  it('deduplicates active account jobs and persists completion', () => {
    const { db } = testDatabase()
    const accounts = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 3)))
    const account = accounts.create({ email: 'jobs@example.com', password: 'password', totpSecret: 'JBSWY3DPEHPK3PXP' })
    const jobs = new JobRepository(db)

    const first = jobs.enqueue({ accountId: account.id, type: 'authorize', payload: { accountName: 'Primary OpenAI' } })
    const duplicate = jobs.enqueue({ accountId: account.id, type: 'authorize' })
    expect(duplicate.id).toBe(first.id)
    expect(first.payload).toEqual({ accountName: 'Primary OpenAI' })

    const claimed = jobs.claimNext('test-worker')
    expect(claimed?.id).toBe(first.id)
    expect(claimed?.attempts).toBe(1)
    jobs.complete(first.id)
    expect(jobs.get(first.id)?.status).toBe('completed')
  })

  it('does not bind a boolean when a job is exhausted', () => {
    const { db } = testDatabase()
    const accounts = new AccountRepository(db, new SecretCipher(Buffer.alloc(32, 3)))
    const account = accounts.create({ email: 'retry@example.com', password: 'password', totpSecret: 'JBSWY3DPEHPK3PXP' })
    const jobs = new JobRepository(db)
    const job = jobs.enqueue({ accountId: account.id, type: 'authorize', maxAttempts: 2 })
    const first = jobs.claimNext('test-worker')!
    expect(first.attempts).toBe(1)
    expect(() => jobs.fail(first, 'REAUTH_FAILED', 'temporary', new Date().toISOString())).not.toThrow()
    expect(jobs.get(job.id)?.status).toBe('pending')
    const second = jobs.claimNext('test-worker')!
    expect(second.attempts).toBe(2)
    expect(() => jobs.fail(second, 'REAUTH_FAILED', 'temporary', new Date().toISOString())).not.toThrow()
    expect(jobs.get(job.id)).toMatchObject({ status: 'failed', errorCode: 'REAUTH_FAILED' })
  })
})
