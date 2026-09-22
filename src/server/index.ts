import { loadConfig } from './config.js'
import { openDatabase } from './db.js'
import { buildApp } from './app.js'

async function main() {
  const config = loadConfig()
  const db = openDatabase(config.dataDir)
  const app = await buildApp(config, db)
  const close = async () => {
    await app.close()
    db.close()
    process.exit(0)
  }
  process.on('SIGTERM', close)
  process.on('SIGINT', close)
  await app.listen({ host: config.server.host, port: config.server.port })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
