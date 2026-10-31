import type { ManagedAccount, TotpRotationStep } from './types.js'

export const TOTP_ROTATION_STEPS: ReadonlyArray<{ id: TotpRotationStep; label: string }> = [
  { id: 'login', label: '登录账号' },
  { id: 'rotate_totp', label: '更换并确认 2FA' },
  { id: 'save_secret', label: '保存新密钥' },
  { id: 'logout_devices', label: '退出所有设备' },
  { id: 'relogin', label: '重新登录' },
  { id: 'import_sub2api', label: '授权并导入 Sub2API' }
]

export type RotationStepStatus = 'pending' | 'waiting' | 'running' | 'completed' | 'failed'

export function totpRotationProgress(account: Pick<ManagedAccount,
  'totpRotationStep' | 'totpRotationStatus' | 'totpRotationError' | 'totpRotationImportStatus' | 'totpRotationImportError'>) {
  const index = TOTP_ROTATION_STEPS.findIndex((step) => step.id === account.totpRotationStep)
  if (index < 0 || !account.totpRotationStatus) return null
  const importing = account.totpRotationStep === 'import_sub2api' && account.totpRotationStatus === 'completed'
  const jobStatus = importing ? account.totpRotationImportStatus : account.totpRotationStatus
  const status: RotationStepStatus = jobStatus === 'pending' || !jobStatus ? 'waiting' : jobStatus
  const recordedError = importing ? account.totpRotationImportError : account.totpRotationError
  const error = status === 'failed' || status === 'waiting' ? recordedError : null
  const label = TOTP_ROTATION_STEPS[index]!.label
  const complete = status === 'completed' && index === TOTP_ROTATION_STEPS.length - 1
  const prefix = status === 'failed' ? '失败' : status === 'waiting' ? (error ? '等待重试' : '等待执行') : status === 'running' ? '进行中' : '已完成'
  return {
    status,
    error,
    importing,
    summary: complete ? '全部步骤已完成（6/6）' : `步骤 ${index + 1}/6 · ${label}：${prefix}`,
    steps: TOTP_ROTATION_STEPS.map((step, stepIndex) => ({
      ...step,
      status: (stepIndex < index ? 'completed' : stepIndex === index ? status : 'pending') as RotationStepStatus
    }))
  }
}
