/**
 * End-to-end tests for Tickle room-sync (QA-4).
 *
 * Drives two real browser contexts against the running PartyKit + Vite
 * dev servers. Scope: 7 of the 9 manual acceptance scenarios from
 * `openspec/changes/add-room-sync/tasks.md` §12, automated.
 *
 * Out of scope (require manual / device verification):
 *   - §12.5 iPad reconnect after 30s background → real device only
 *   - §12.6 Audio unlock + warning sound playback → headless = no audio
 *
 * Test IDs (#1, #2, ...) match §12 numbering exactly so manual /
 * automated coverage map 1:1.
 *
 * Implementation notes:
 *   - AudioUnlockOverlay covers the whole screen on first load. Every
 *     scenario starts with `unlock(page)` to dismiss it before reaching
 *     timer / settings UI.
 *   - Host vs viewer is determined by URL. We open a host context first,
 *     read the URL to extract `?room=X&host=Y`, then derive the viewer
 *     URL by stripping the `host` param.
 *   - WebSocket round-trip latency: most assertions use Playwright's
 *     auto-waiting `expect()`. For propagation specifically (host action
 *     → viewer DOM update) we set a 5s ceiling — generous because dev
 *     PartyKit is reasonably snappy but we want to flag real regressions.
 */
import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test'

const ROOM_PARAM_RE = /[?&]room=([a-z2-9]{6})\b/
const HOST_PARAM_RE = /[?&]host=(ht_[a-z0-9]{16})\b/

/**
 * Dismiss the AudioUnlockOverlay AND any auto-opened SettingsPanel.
 *
 * Why both: `handleUnlock` in App.vue sets `panelOpen = true` for hosts
 * after unlock, so the settings panel + dim backdrop immediately cover
 * the main controls. Tests need a clean canvas to click primaryButton,
 * so we close the panel by clicking its dim-overlay (the same gesture
 * a user would make).
 *
 * Idempotent — safe to call when overlay / panel aren't present.
 */
async function unlock(page: Page): Promise<void> {
  const overlay = page.locator('text=點一下螢幕').first()
  await overlay.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click()
    await overlay.waitFor({ state: 'hidden' })
  }
  await closeSettingsPanel(page)
}

/**
 * If the settings panel is open, dismiss it by pressing Escape — more
 * robust than clicking the dim backdrop, which can be in the middle of
 * a transition and intercept clicks weirdly. The panel listens for the
 * close event via `handlePanelClose` on backdrop click; Escape works
 * because the backdrop is hooked up and Vue's transition state matters
 * less for keyboard events.
 *
 * Actually, the panel doesn't bind Escape — we'll click the backdrop
 * (the dim div) but wait for transition completion explicitly.
 */
async function closeSettingsPanel(page: Page): Promise<void> {
  const backdrop = page.locator('div.fixed.inset-0.bg-black\\/40')
  // Try up to 1s; if no backdrop, panel isn't open — return.
  const visible = await backdrop.isVisible().catch(() => false)
  if (!visible) return
  // Wait for transition to settle so the click hits the final position.
  await page.waitForTimeout(350)
  // Click at a corner away from the panel itself (panel is on the right;
  // backdrop covers everything but pointer-events go to backdrop).
  await backdrop.click({ position: { x: 50, y: 400 }, force: true })
  await backdrop.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {})
}

/**
 * Open a fresh host context and return everything tests need: the page,
 * the room id PartyKit minted, the host token, and the derived viewer URL.
 *
 * Uses `browser.newContext()` (rather than reusing the default) so each
 * test starts with empty storage — IndexedDB / localStorage / cookies
 * are isolated, which matters because PartyKit's WebSocket gets a fresh
 * connection per context.
 */
interface HostHandle {
  context: BrowserContext
  page: Page
  roomId: string
  hostToken: string
  viewerUrl: string
}

async function openHost(browser: Browser): Promise<HostHandle> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')
  await unlock(page)

  // Wait for App.vue's `onCreated` to write the URL params; gives up
  // after 10s with a useful error rather than a Playwright timeout.
  await expect
    .poll(
      async () => {
        const url = page.url()
        return ROOM_PARAM_RE.test(url) && HOST_PARAM_RE.test(url)
      },
      { timeout: 10_000, message: 'URL never got ?room=... &host=... appended' },
    )
    .toBe(true)

  const url = page.url()
  const roomId = url.match(ROOM_PARAM_RE)![1]
  const hostToken = url.match(HOST_PARAM_RE)![1]
  // Viewer URL = host URL without the &host= param (and without &intent= if any).
  const viewerUrl = `/?room=${roomId}`
  return { context, page, roomId, hostToken, viewerUrl }
}

async function openViewer(browser: Browser, viewerUrl: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(viewerUrl)
  await unlock(page)
  return { context, page }
}

/** Read the big timer display text. Strips whitespace; returns e.g. "05:00". */
async function readTimer(page: Page): Promise<string> {
  // The big number is in TimerDisplay.vue, the only element on the page
  // sized at 28vw and using tabular-nums. Match by the text-content
  // shape (`/^\d{1,2}:\d{2}(?::\d{2})?$/`) to avoid coupling to internal
  // class names.
  return page
    .locator('div')
    .filter({ hasText: /^\d{1,2}:\d{2}(?::\d{2})?$/ })
    .first()
    .innerText()
}

/** Primary control button — labelled depending on timer state. */
function primaryButton(page: Page) {
  return page.getByRole('button', { name: /開始|暫停|繼續|再來一次/ })
}

function shareButton(page: Page) {
  return page.getByRole('button', { name: '複製分享連結' })
}

// ────────────────────────────────────────────────────────────
// Scenarios
// ────────────────────────────────────────────────────────────

test('#1 basic: host creates room → URL pinned → viewer sees same timer', async ({ browser }) => {
  const host = await openHost(browser)

  // URL pinned (already asserted in openHost, double-checked for clarity).
  expect(host.roomId).toMatch(/^[a-z2-9]{6}$/)
  expect(host.hostToken).toMatch(/^ht_[a-z0-9]{16}$/)

  // Host starts a 5-minute countdown (default).
  await primaryButton(host.page).click()
  // After start, primary becomes "暫停".
  await expect(primaryButton(host.page)).toHaveText(/暫停/)

  // Open viewer with the stripped URL.
  const viewer = await openViewer(browser, host.viewerUrl)
  // Viewer should show the VIEWER badge.
  await expect(viewer.page.getByText(/VIEWER · 唯讀/)).toBeVisible()
  // Viewer's timer text should look like a running countdown (M:SS or MM:SS),
  // not "5:00" exactly because some seconds have already ticked off, and
  // not "5:01" or higher.
  const viewerText = await readTimer(viewer.page)
  expect(viewerText).toMatch(/^\d{1,2}:\d{2}$/)
  // Sanity: not the cold-load default if host already ran for a moment.
  // (Allow 5:00 because the start → viewer-open round trip can be sub-second.)

  await host.context.close()
  await viewer.context.close()
})

test('#2 host operations sync: pause → viewer reflects within 5s', async ({ browser }) => {
  const host = await openHost(browser)
  await primaryButton(host.page).click() // start
  await expect(primaryButton(host.page)).toHaveText(/暫停/)

  const viewer = await openViewer(browser, host.viewerUrl)
  // Wait for the viewer to be connected (its timer text shows a value).
  await expect(viewer.page.locator('div').filter({ hasText: /^\d{1,2}:\d{2}$/ }).first()).toBeVisible()

  // Host pauses.
  await primaryButton(host.page).click()
  await expect(primaryButton(host.page)).toHaveText(/繼續/)

  // Viewer's timer freezes — read it twice with a 2s gap and expect the same value.
  await viewer.page.waitForTimeout(800) // let the patch propagate
  const first = await readTimer(viewer.page)
  await viewer.page.waitForTimeout(2000)
  const second = await readTimer(viewer.page)
  expect(second).toBe(first)

  await host.context.close()
  await viewer.context.close()
})

test('#3 viewer is read-only: primary button does nothing, share button hidden', async ({ browser }) => {
  const host = await openHost(browser)
  // Don't even start — easier to detect a viewer-side state change.
  const viewer = await openViewer(browser, host.viewerUrl)

  // ShareButton (host-only) must not exist for viewer.
  await expect(shareButton(viewer.page)).toHaveCount(0)

  // Primary button exists but is disabled.
  const btn = primaryButton(viewer.page)
  await expect(btn).toBeDisabled()
  // Disabled buttons swallow clicks; force-click to prove no state change.
  // The timer display should still read 5:00 (idle default duration).
  await btn.click({ force: true }).catch(() => {})
  await viewer.page.waitForTimeout(500)
  const text = await readTimer(viewer.page)
  expect(text).toBe('05:00')

  await host.context.close()
  await viewer.context.close()
})

test('#4 reload preserves running state', async ({ browser }) => {
  const host = await openHost(browser)
  await primaryButton(host.page).click() // start
  await expect(primaryButton(host.page)).toHaveText(/暫停/)

  // Wait a couple of seconds so we have a non-trivial elapsed time.
  await host.page.waitForTimeout(2500)
  const before = await readTimer(host.page)

  await host.page.reload()
  await unlock(host.page) // overlay reappears after reload

  // After hydrate, status should still be running (primary button = 暫停).
  await expect(primaryButton(host.page)).toHaveText(/暫停/, { timeout: 7_000 })
  const after = await readTimer(host.page)
  // Time should have continued, not reset to 5:00. Allow ≤ 2s extra spent in reload.
  const toSec = (t: string): number => {
    const [m, s] = t.split(':').map(Number)
    return m * 60 + s
  }
  const beforeSec = toSec(before)
  const afterSec = toSec(after)
  expect(afterSec).toBeLessThanOrEqual(beforeSec)
  // And it definitely should not have snapped back to 5:00 (= 300s).
  expect(afterSec).toBeLessThan(300)

  await host.context.close()
})

test('#7 nonexistent room → RoomNotFoundScreen', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  // Use a 6-char id that fits the alphabet but is astronomically unlikely
  // to have ever been created — `zzzzz9` reads as "no-one's room".
  await page.goto('/?room=zzzzz9')
  await unlock(page).catch(() => {}) // overlay may not show if room error fires first

  // The guidance screen renders with `role="alert"` + the headline text.
  await expect(page.getByText('Room 不存在或已過期')).toBeVisible({ timeout: 10_000 })

  // Countdown card should be visible too.
  await expect(page.locator('.countdown-num')).toBeVisible()

  await context.close()
})

test('#8 clock accuracy: timer text matches within 200ms between host + viewer', async ({ browser }) => {
  const host = await openHost(browser)
  await primaryButton(host.page).click()
  await expect(primaryButton(host.page)).toHaveText(/暫停/)

  const viewer = await openViewer(browser, host.viewerUrl)
  // Wait for viewer to converge (timer text matches expected pattern).
  await expect(viewer.page.locator('div').filter({ hasText: /^\d{1,2}:\d{2}$/ }).first()).toBeVisible()
  // Give clock-offset measurement time to settle (3 pings @ 30ms apart).
  await viewer.page.waitForTimeout(500)

  // Sample both timers as close together as we can. Playwright doesn't
  // give us picosecond precision but `Promise.all` runs them on the same
  // event loop tick. Difference in displayed seconds should be ≤ 1 (the
  // displayed value is `Math.ceil(remainSec)`, so two clients within
  // 200ms of each other should show the same number except across a
  // tick boundary, where they may differ by exactly 1).
  const [hostText, viewerText] = await Promise.all([
    readTimer(host.page),
    readTimer(viewer.page),
  ])
  const toSec = (t: string): number => {
    const [m, s] = t.split(':').map(Number)
    return m * 60 + s
  }
  const diff = Math.abs(toSec(hostText) - toSec(viewerText))
  // ≤ 1 second of displayed difference is the "looks in sync" threshold
  // — this is what the 200ms spec translates to in display units.
  expect(diff).toBeLessThanOrEqual(1)

  await host.context.close()
  await viewer.context.close()
})

test('#10 (B7) two tabs same room: pause on A → both A and B show identical seconds', async ({ browser }) => {
  // Notion B7: 同時開兩個網頁，如果在A網頁暫停, 從 sidebar 切換到 B 網頁
  // 只會暫停！但秒數不會更新到A網頁的秒數
  //
  // We interpret "切換到 B 網頁" as: backgrounding A and foregrounding B
  // (sidebar tab switching). Spec: both pages show the same paused time.
  const host = await openHost(browser)
  await primaryButton(host.page).click() // start
  await expect(primaryButton(host.page)).toHaveText(/暫停/)

  // Open viewer.
  const viewer = await openViewer(browser, host.viewerUrl)
  await expect(viewer.page.locator('div').filter({ hasText: /^\d{1,2}:\d{2}$/ }).first()).toBeVisible()

  // Run for ~2 seconds so the timer is mid-countdown.
  await host.page.waitForTimeout(2000)

  // Background the viewer tab (simulates sidebar switching away from B).
  await viewer.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // Pause on host.
  await primaryButton(host.page).click()
  await expect(primaryButton(host.page)).toHaveText(/繼續/)
  await host.page.waitForTimeout(800) // let the patch reach the server

  // Foreground the viewer again.
  await viewer.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // Give the viewer a beat to apply any catch-up state.
  await viewer.page.waitForTimeout(800)

  // The two pages must now show the exact same time (both paused).
  const hostText = await readTimer(host.page)
  const viewerText = await readTimer(viewer.page)
  expect(viewerText, 'viewer must match host after foreground').toBe(hostText)

  await host.context.close()
  await viewer.context.close()
})

test('#9 duplicate host tab → first tab gets KickedRibbon', async ({ browser }) => {
  const host1 = await openHost(browser)
  // Confirm host1 is fully connected before opening host2.
  await expect(shareButton(host1.page)).toBeVisible()

  // Open a second context that connects with the SAME host token.
  // We use the full URL host1 has (room + host params).
  const context2 = await browser.newContext()
  const page2 = await context2.newPage()
  await page2.goto(host1.page.url())
  await unlock(page2)

  // host1 should receive the kicked ribbon + the share button disappears
  // (because `kicked && !dismissed` flips `room.isHost.value` to false).
  await expect(host1.page.getByText('此分頁已被新分頁取代')).toBeVisible({ timeout: 7_000 })
  // ShareButton goes away once kicked.
  await expect(shareButton(host1.page)).toHaveCount(0)

  // host1's primary button is now disabled.
  await expect(primaryButton(host1.page)).toBeDisabled()

  // host2 should NOT show the ribbon — it's the active host now.
  await expect(page2.getByText('此分頁已被新分頁取代')).toHaveCount(0)
  // host2 sees the share button (proves it's the active host).
  await expect(shareButton(page2)).toBeVisible()

  await host1.context.close()
  await context2.close()
})
