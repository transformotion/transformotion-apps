import { chromium } from 'playwright'
import path from 'node:path'

// Captures the built SA Home dashboard. Mock mode auto-authenticates and seeds
// portfolio/watchlist/quotes/recs/market fixtures, so no localStorage seed is
// needed — Home is the default landing tab.
const OUT = process.argv[2] || '.'
const BASE = 'http://localhost:3000/stock-analyser/'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()) })

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 })
await page.waitForTimeout(2000)
try {
  await page.getByText('Market Signals').first().waitFor({ timeout: 25000 })
} catch {
  console.log('WARN: Market Signals heading not found; capturing whatever rendered')
}
// give enrichment (portfolio/watchlist prices) + chart a moment to paint
await page.waitForTimeout(3500)
await page.screenshot({ path: path.join(OUT, 'sa-home-built.png'), fullPage: true })
console.log('captured sa home')

await browser.close()
