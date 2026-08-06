// Reusable Playwright helpers for manually walking through the app as a real browser
// session — used for UX/navigation audits (screenshots + console error capture), not
// automated CI tests. See CLAUDE.md "Browser Testing (Playwright)" for usage and gotchas.
//
// Typical usage from a throwaway script (keep one-off walkthrough scripts local/gitignored,
// only this driver is committed):
//
//   import { launch, login, shot, BASE } from '../scripts/playwright-drive.mjs'
//   const { browser, page } = await launch()
//   await login(page, 'member.winfire@fireops7.com', 'Hello1!')
//   await page.goto(`${BASE}/personnel`)
//   await shot(page, 'personnel')
//   await browser.close()

import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const BASE = process.env.PW_BASE_URL || 'http://localhost:3000'
const SHOT_DIR = path.join(process.cwd(), 'shots')
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true })

let shotIndex = 0
export async function shot(page, name) {
  shotIndex++
  const file = path.join(SHOT_DIR, `${String(shotIndex).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log('SCREENSHOT:', file)
  return file
}

export const VIEWPORTS = {
  desktop: { width: 1400, height: 900 },
  mobile: { width: 390, height: 844 }, // iPhone 12/13/14-class width, triggers the sm: breakpoint switch to MobileSidebar
}

export async function launch(viewport = VIEWPORTS.desktop) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('script resource is behind a redirect')) console.log('CONSOLE ERROR:', msg.text()) })
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message))
  return { browser, context, page }
}

// Password set for any account that goes through the temp-password flow during a walkthrough.
const NEW_PASSWORD = 'AuditWalk2026!'

async function settle(page) {
  // Turbopack dev shows a "Compiling..." badge while lazily building a route on first hit —
  // this can take 30s+ for heavy pages (dashboard, etc). Wait it out generously rather than
  // racing it; a short fixed sleep here produces false "stuck on this page" failures.
  await page.waitForTimeout(1000)
  try {
    // Turbopack's dev indicator wording varies by Next.js version ("Compiling...", "Rendering...") —
    // match both rather than hardcoding one, or a route mid-compile reads as already-settled.
    await page.waitForFunction(() => !/Compiling|Rendering/.test(document.body.innerText), { timeout: 60000 })
  } catch {
    console.log('  (still compiling after 60s — proceeding anyway)')
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
}

// Logs in; if landed on /change-password (temp_password status), sets NEW_PASSWORD and
// continues. If landed on /profile-setup (first/last name blank), fills minimal required
// fields and continues. Returns the final URL reached.
export async function login(page, email, password, profile = { first: 'Test', last: 'User' }) {
  await page.goto(`${BASE}/login`)
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 15000 })
  await page.fill('input[name="email"], input[type="email"]', email)
  await page.fill('input[name="password"], input[type="password"]', password)
  await page.click('button[type="submit"]')
  await settle(page)

  if (page.url().includes('/change-password')) {
    console.log(`[${email}] temp password flow — setting new password`)
    await page.fill('input[name="password"]', NEW_PASSWORD)
    await page.fill('input[name="confirm"]', NEW_PASSWORD)
    await page.click('button[type="submit"]')
    await settle(page)
  }

  if (page.url().includes('/profile-setup')) {
    console.log(`[${email}] profile-setup — filling minimal fields`)
    await page.locator('input').first().fill(profile.first)
    await page.locator('input').nth(1).fill(profile.last)
    await page.click('button[type="submit"]')
    await settle(page)
  }

  console.log(`[${email}] final URL:`, page.url())
  return page.url()
}

export { BASE, NEW_PASSWORD, settle }
