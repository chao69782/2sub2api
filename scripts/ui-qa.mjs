import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:1000'
const password = process.env.QA_PASSWORD
const executablePath = process.env.QA_BROWSER_PATH
const outputDirectory = process.env.QA_SCREENSHOT_DIR
if (!password || !executablePath || !outputDirectory) throw new Error('QA_PASSWORD, QA_BROWSER_PATH and QA_SCREENSHOT_DIR are required')
fs.mkdirSync(outputDirectory, { recursive: true })

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const failures = []
page.on('pageerror', (error) => failures.push(`page: ${error.message}`))

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.screenshot({ path: path.join(outputDirectory, 'login-desktop.png'), fullPage: true })
await page.getByLabel('账号').fill('admin')
await page.getByLabel('密码').fill(password)
await page.getByRole('button', { name: '登录' }).click()
await page.waitForURL('**/accounts')
await page.screenshot({ path: path.join(outputDirectory, 'accounts-desktop.png'), fullPage: true })

await page.setViewportSize({ width: 375, height: 812 })
await page.screenshot({ path: path.join(outputDirectory, 'accounts-mobile.png'), fullPage: true })
const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
if (bodyWidth > 375) failures.push(`mobile body scrollWidth ${bodyWidth}px exceeds viewport`)

await page.getByRole('button', { name: '添加账号' }).click()
const email = `qa-${Date.now()}@example.com`
await page.getByLabel('账号数据').fill(`${email}----Password-For-QA------JBSWY3DPEHPK3PXP`)
await Promise.all([
  page.waitForResponse((response) => response.url().includes('/api/accounts/import/preview') && response.status() === 200),
  page.getByRole('button', { name: '预检' }).click()
])
await page.getByText(email).waitFor()
await page.screenshot({ path: path.join(outputDirectory, 'import-mobile.png'), fullPage: true })
await Promise.all([
  page.waitForResponse((response) => response.url().endsWith('/api/accounts/import') && response.status() === 201),
  page.getByRole('button', { name: /^导入 1$/ }).click()
])
await page.getByRole('dialog').waitFor({ state: 'hidden' })
await page.locator('article').getByText(email, { exact: true }).waitFor()
await page.screenshot({ path: path.join(outputDirectory, 'account-row-mobile.png'), fullPage: true })
const bodyWidthWithAccount = await page.locator('body').evaluate((element) => element.scrollWidth)
if (bodyWidthWithAccount > 375) failures.push(`mobile account list scrollWidth ${bodyWidthWithAccount}px exceeds viewport`)

await page.getByRole('link', { name: '设置' }).click()
await page.waitForResponse((response) => response.url().includes('/api/metadata/proxies'))
await page.screenshot({ path: path.join(outputDirectory, 'settings-mobile.png'), fullPage: true })
await page.setViewportSize({ width: 1440, height: 900 })
await page.screenshot({ path: path.join(outputDirectory, 'settings-desktop.png'), fullPage: true })

await browser.close()
if (failures.length) throw new Error(failures.join('\n'))
console.log(JSON.stringify({ ok: true, bodyWidth, bodyWidthWithAccount, screenshots: 7 }))
