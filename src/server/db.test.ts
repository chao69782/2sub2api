import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './db.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('database rollback migrations', () => {
  it('adds scheduling state to an existing database and persists manual pauses across restarts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-workbench-scheduling-migration-'))
    directories.push(directory)
    let db = openDatabase(directory)
    db.prepare(`INSERT INTO managed_accounts(id, email_normalized, email_display, created_at, updated_at)
      VALUES ('paused-account', 'paused@example.com', 'paused@example.com', ?, ?)`)
      .run(new Date().toISOString(), new Date().toISOString())
    db.exec('ALTER TABLE managed_accounts DROP COLUMN scheduling_paused')
    db.close()
    db = openDatabase(directory)
    expect(db.prepare("SELECT scheduling_paused FROM managed_accounts WHERE id = 'paused-account'").get()).toEqual({ scheduling_paused: 0 })
    db.prepare("UPDATE managed_accounts SET scheduling_paused = 1 WHERE id = 'paused-account'").run()
    db.close()
    db = openDatabase(directory)
    expect(db.prepare("SELECT scheduling_paused FROM managed_accounts WHERE id = 'paused-account'").get()).toEqual({ scheduling_paused: 1 })
    db.close()
  })

  it('removes profit schema while preserving existing account data', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-workbench-db-rollback-'))
    directories.push(directory)
    const initial = openDatabase(directory)
    initial.prepare(`
      INSERT INTO managed_accounts(
        id, email_normalized, email_display, notes, tags_json, auth_policy,
        auth_status, health_status, sync_status, import_profile_version,
        created_at, updated_at
      ) VALUES (?, ?, ?, '', '[]', 'managed_login', 'not_authorized', 'unknown', 'not_synced', 1, ?, ?)
    `).run('account-1', 'account@example.com', 'account@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    initial.exec(`
      ALTER TABLE managed_accounts ADD COLUMN cost_price REAL NOT NULL DEFAULT 0;
      UPDATE managed_accounts SET cost_price = 12.5 WHERE id = 'account-1';
      CREATE TABLE profit_settlements (id TEXT PRIMARY KEY, account_id TEXT NOT NULL);
      CREATE TABLE profit_limit_states (
        account_id TEXT PRIMARY KEY,
        active INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(account_id) REFERENCES managed_accounts(id) ON DELETE CASCADE
      );
      INSERT INTO profit_settlements(id, account_id) VALUES ('profit-1', 'account-1');
      INSERT INTO profit_limit_states(account_id, active) VALUES ('account-1', 1);
    `)
    initial.close()

    const migrated = openDatabase(directory)
    expect(migrated.prepare('SELECT email_display FROM managed_accounts WHERE id = ?').get('account-1'))
      .toEqual({ email_display: 'account@example.com' })
    const accountColumns = (migrated.pragma('table_info(managed_accounts)') as Array<{ name: string }>).map((column) => column.name)
    expect(accountColumns).not.toContain('cost_price')
    const tables = (migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)
    expect(tables).not.toContain('profit_settlements')
    expect(tables).not.toContain('profit_limit_states')
    migrated.close()
  })
})
