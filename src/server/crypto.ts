import crypto from 'node:crypto'

export interface EncryptedValue {
  ciphertext: Buffer
  nonce: Buffer
  authTag: Buffer
}

export class SecretCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SecretCipher requires a 32-byte key')
  }

  encrypt(value: string): EncryptedValue {
    const nonce = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, nonce)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return { ciphertext, nonce, authTag: cipher.getAuthTag() }
  }

  decrypt(value: EncryptedValue): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, value.nonce)
    decipher.setAuthTag(value.authTag)
    return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString('utf8')
  }
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}
