import { describe, expect, it } from 'vitest'
import { totpRotationProgress } from './totp-rotation.js'

const account: Parameters<typeof totpRotationProgress>[0] = {
  totpRotationStep: 'relogin', totpRotationStatus: 'running', totpRotationError: null,
  totpRotationImportStatus: null, totpRotationImportError: null
}

describe('2FA operation step display', () => {
  it('marks only earlier steps complete while a step is running', () => {
    const progress = totpRotationProgress(account)!
    expect(progress.summary).toBe('步骤 5/6 · 重新登录：进行中')
    expect(progress.steps.map((step) => step.label)).toEqual(['登录账号', '更换并确认 2FA', '保存新密钥', '退出所有设备', '重新登录', '授权并导入 Sub2API'])
    expect(progress.steps.map((step) => step.status)).toEqual(['completed', 'completed', 'completed', 'completed', 'running', 'pending'])
  })

  it('keeps the failed step and its reason while leaving later steps unstarted', () => {
    const progress = totpRotationProgress({ ...account, totpRotationStatus: 'failed', totpRotationError: '邮箱验证失败' })!
    expect(progress.status).toBe('failed')
    expect(progress.error).toBe('邮箱验证失败')
    expect(progress.steps.map((step) => step.status)).toEqual(['completed', 'completed', 'completed', 'completed', 'failed', 'pending'])
  })

  it('shows the import as waiting after 2FA succeeds', () => {
    const progress = totpRotationProgress({ ...account, totpRotationStep: 'import_sub2api', totpRotationStatus: 'completed', totpRotationImportStatus: 'pending' })!
    expect(progress.status).toBe('waiting')
    expect(progress.steps.map((step) => step.status)).toEqual(['completed', 'completed', 'completed', 'completed', 'completed', 'waiting'])
  })

  it('reports import failure independently of a successful 2FA change', () => {
    const progress = totpRotationProgress({ ...account, totpRotationStep: 'import_sub2api', totpRotationStatus: 'completed', totpRotationImportStatus: 'failed', totpRotationImportError: 'Sub2API 无法连接' })!
    expect(progress.importing).toBe(true)
    expect(progress.error).toBe('Sub2API 无法连接')
    expect(progress.steps.slice(0, 5).every((step) => step.status === 'completed')).toBe(true)
    expect(progress.steps[5]?.status).toBe('failed')
  })

  it('finishes all steps only after the linked import completes', () => {
    const progress = totpRotationProgress({ ...account, totpRotationStep: 'import_sub2api', totpRotationStatus: 'completed', totpRotationImportStatus: 'completed', totpRotationImportError: '上一次尝试失败' })!
    expect(progress.summary).toBe('全部步骤已完成（6/6）')
    expect(progress.error).toBeNull()
    expect(progress.steps.every((step) => step.status === 'completed')).toBe(true)
  })

  it('shows a scheduled retry without inventing later completed steps', () => {
    const progress = totpRotationProgress({ ...account, totpRotationStatus: 'pending', totpRotationError: '网络超时' })!
    expect(progress.summary).toContain('等待重试')
    expect(progress.steps[4]?.status).toBe('waiting')
    expect(progress.steps[5]?.status).toBe('pending')
  })

  it('retains the legacy result when no step history was recorded', () => {
    expect(totpRotationProgress({ ...account, totpRotationStep: null, totpRotationStatus: 'completed' })).toBeNull()
  })
})
