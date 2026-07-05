// UI-review screenshot runner (Playwright). Config-driven: see surfaces.mjs.
//
// Usage:
//   node capture.mjs                      # boot app (mock) + capture every surface/state
//   node capture.mjs --surface <name>     # only that surface
//   node capture.mjs --no-boot            # reuse an already-running dev server
//   node capture.mjs --out <dir>          # output dir (default: ./out)
//
// Output: <out>/<surface>/<state>.png. These are PR-attachment-only (see README) —
// drag-drop them into the PR body; they are gitignored and never committed.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { app, surfaces } from './surfaces.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')

const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
const surfaceFilter = opt('--surface', null)
const noBoot = flag('--no-boot')
const outDir = opt('--out', join(HERE, 'out'))

// ── tiny .env parser (KEY=VALUE, # comments) ──────────────────────────────────
function loadEnvFile(name) {
  const p = join(HERE, name)
  if (!existsSync(p)) return {}
  const env = {}
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
  return env
}

// ── locator DSL ───────────────────────────────────────────────────────────────
function resolve(page, spec) {
  if (spec.role) return page.getByRole(spec.role[0], { name: spec.role[1] }).first()
  if (spec.text !== undefined) return page.getByText(spec.text, { exact: spec.exact ?? false }).first()
  if (spec.label) return page.getByLabel(spec.label).first()
  if (spec.placeholder) return page.getByPlaceholder(spec.placeholder).first()
  if (spec.testId) return page.getByTestId(spec.testId).first()
  if (spec.selector) {
    let loc = page.locator(spec.selector)
    if (spec.hasText) loc = loc.filter({ hasText: spec.hasText })
    return loc.first()
  }
  throw new Error('unknown locator spec: ' + JSON.stringify(spec))
}

async function step(page, action) {
  if (action.click) await resolve(page, action.click).click()
  else if (action.fill) await resolve(page, action.fill).fill(action.text ?? '') // { fill: <locator>, text }
  else if (action.waitVisible) await resolve(page, action.waitVisible).waitFor({ state: 'visible', timeout: 15000 })
  else if (action.waitHidden) await resolve(page, action.waitHidden).waitFor({ state: 'hidden', timeout: 15000 })
  else if (action.press) await page.keyboard.press(action.press)
  else if (action.wait) await page.waitForTimeout(action.wait)
  else throw new Error('unknown action: ' + JSON.stringify(action))
}

// ── boot / wait / teardown ────────────────────────────────────────────────────
function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now()
  return new Promise((res, rej) => {
    const tick = () => {
      const req = http.get(url, (r) => { r.resume(); res() })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) rej(new Error('server never came up: ' + url))
        else setTimeout(tick, 1000)
      })
    }
    tick()
  })
}

function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else { try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ } }
}

async function main() {
  let server = null
  if (!noBoot) {
    const env = { ...process.env, ...loadEnvFile(app.envFile) }
    console.log('[boot]', app.bootCommand)
    server = spawn(app.bootCommand, {
      cwd: REPO_ROOT,
      env,
      shell: true,
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    })
    await waitForServer(app.baseURL)
    console.log('[boot] up at', app.baseURL)
  } else {
    console.log('[boot] --no-boot: expecting a dev server at', app.baseURL)
  }

  const browser = await chromium.launch()
  const captured = []
  try {
    for (const surface of surfaces) {
      if (surfaceFilter && surface.name !== surfaceFilter) continue
      console.log('[surface]', surface.name)
      for (const state of surface.states) {
        const page = await browser.newPage({
          viewport: surface.viewport ?? { width: 1440, height: 1800 },
          deviceScaleFactor: 2,
        })
        page.on('console', (m) => { if (m.type() === 'error') console.log('  page-err:', m.text().slice(0, 200)) })
        // Reset-per-state: fresh load → replay nav → state actions → capture.
        await page.goto(app.baseURL, { waitUntil: 'networkidle', timeout: 60000 })
        for (const nav of surface.nav ?? []) await step(page, nav)
        for (const action of state.actions ?? []) await step(page, action)
        await page.waitForTimeout(400) // settle optimistic re-render
        const dir = join(outDir, surface.name)
        mkdirSync(dir, { recursive: true })
        const file = join(dir, `${state.name}.png`)
        if (surface.clip) await resolve(page, surface.clip).screenshot({ path: file })
        else await page.screenshot({ path: file, fullPage: true })
        captured.push(file)
        console.log('  captured', `${surface.name}/${state.name}`)
        await page.close()
      }
    }
  } finally {
    await browser.close()
    killTree(server)
  }

  console.log(`\nDONE — ${captured.length} capture(s) under ${outDir}`)
  console.log('To review on a PR (policy a′ — branch-only, removed at merge; see README):')
  console.log('  1. copy into docs/review/<feature>/ and commit it (isolated, droppable)')
  console.log('  2. embed via a SHA-pinned raw URL in the PR body')
  console.log('  3. git rm docs/review/<feature>/ before the squash-merge (develop stays binary-free)')
  for (const f of captured) console.log('  ' + f)
}

main().catch((e) => { console.error('CAPTURE-FAIL:', e.message); process.exit(1) })
