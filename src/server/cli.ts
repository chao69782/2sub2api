import { hash } from '@node-rs/argon2'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

async function main() {
  if (process.argv[2] !== 'hash-password') {
    console.error('Usage: npm run hash-password')
    process.exitCode = 1
    return
  }
  const terminal = readline.createInterface({ input: stdin, output: stdout })
  const password = await terminal.question('Password: ')
  terminal.close()
  if (password.length < 12) throw new Error('Password must contain at least 12 characters')
  console.log(await hash(password, { memoryCost: 65536, timeCost: 3, parallelism: 1 }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
