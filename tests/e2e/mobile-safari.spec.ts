import { test, expect, type Page } from '@playwright/test'

// Get past the audio unlock + auto-opened settings panel so the main
// surface is reachable. Returns nothing — the page is left at the main
// timer view.
async function dismissOverlays(page: Page) {
  const overlay = page.getByText('點一下螢幕')
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click()
    await overlay.waitFor({ state: 'hidden', timeout: 5_000 })
  }
  // Hosts get the settings panel auto-opened after the audio unlock.
  // Click its backdrop (the dimmed overlay outside the panel) — that's
  // a stable target that exists independent of the slide-in animation
  // and triggers the same panelOpen=false path as the close button.
  await page.waitForTimeout(400) // let the slide-in animation finish
  const backdrop = page.locator('.fixed.inset-0.bg-black\\/40').first()
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.click({ position: { x: 5, y: 5 }, force: true })
    await page.waitForTimeout(400) // let slide-out finish
  }
}

test.describe('mobile Safari', () => {
  // B2: audio must play on iOS Safari. We can't actually verify sound
  // output, but we CAN verify:
  //   1. The AudioContext gets created and resumed (state === 'running')
  //   2. playSound() executes without throwing
  //   3. The preview button in SettingsPanel triggers the audio path
  // This catches regressions where the unlock-then-play handshake breaks
  // (which is the historical iOS Safari failure mode — silent drops, no
  // exceptions thrown).
  test('B2: AudioContext unlocks and reaches running state', async ({ page }) => {
    await page.goto('/tickle/?seconds=10')

    // Listen for the "[tickle] ensureAudio done" log to confirm unlock ran.
    const ensureAudioDone = page.waitForEvent('console', {
      predicate: (msg) =>
        msg.text().includes('[tickle] ensureAudio done'),
      timeout: 8_000,
    })

    await page.getByText('點一下螢幕').click()
    const msg = await ensureAudioDone
    expect(msg.text(), 'ensureAudio should report ctx running').toContain('running')
  })

  test('B2: pressing play schedules audio via playSound (no silent drop)', async ({ page }) => {
    await page.goto('/tickle/?seconds=3&final=bell')
    await dismissOverlays(page)

    // playSound is called when the warning trigger fires (and again at done).
    // We listen for the "[tickle] playSound" log to confirm the call site
    // ran. If iOS Safari were dropping audio at this stage we'd still see
    // the log (logging happens BEFORE the schedule), so this asserts the
    // app code reaches the playSound branch — not that audio is heard.
    // The real "silent drop" symptom on iOS is `ctx.state === 'suspended'`
    // at this point, which we also assert.
    const playSoundLogged = page.waitForEvent('console', {
      predicate: (msg) => msg.text().includes('[tickle] playSound'),
      timeout: 15_000,
    })

    await page.getByRole('button', { name: '開始' }).click()
    const msg = await playSoundLogged
    expect(
      msg.text(),
      'AudioContext must be running when playSound fires',
    ).toContain('ctx.state = running')
  })

  test('B3: ShareButton stays inside viewport and does not overlap the primary button on mobile', async ({ page }) => {
    // Host mode forces the ShareButton (bottom-left) to render.
    await page.goto('/tickle/?room=test123&host=hosttoken')
    await dismissOverlays(page)

    const shareBtn = page.getByRole('button', { name: '複製分享連結' }).first()
    await expect(shareBtn).toBeVisible({ timeout: 8_000 })

    const viewport = page.viewportSize()!
    const shareBox = (await shareBtn.boundingBox())!

    // Pin to viewport horizontally.
    expect(
      shareBox.x,
      'share button left edge must be ≥ 0',
    ).toBeGreaterThanOrEqual(0)
    expect(
      shareBox.x + shareBox.width,
      'share button right edge must be ≤ viewport width',
    ).toBeLessThanOrEqual(viewport.width + 1)

    // Must not overlap the bottom-right primary button cluster.
    const primary = page.getByRole('button', { name: '開始' })
    const primaryBox = (await primary.boundingBox())!
    expect(
      shareBox.x + shareBox.width,
      'share button must not overlap the right-bottom controls',
    ).toBeLessThanOrEqual(primaryBox.x + 1)
  })

  // Skipped: this requires a live PartyKit server connection so the
  // host-token flow resolves and the share dialog actually opens. It's
  // covered by G3's room-sync.spec.ts work. The original B3 bug ("複製
  // 連結會跑版") is locked by the ShareButton viewport spec above.
  test.skip('B3: ShareDialog renders within viewport on mobile', async ({ page }) => {
    await page.goto('/tickle/?room=test123&host=hosttoken')
    await dismissOverlays(page)

    const shareBtn = page.getByRole('button', { name: '複製分享連結' }).first()
    await expect(shareBtn).toBeVisible({ timeout: 8_000 })
    await shareBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    const viewport = page.viewportSize()!
    const dialogBox = (await dialog.boundingBox())!
    expect(
      dialogBox.x,
      'dialog left edge must be on-screen',
    ).toBeGreaterThanOrEqual(0)
    expect(
      dialogBox.x + dialogBox.width,
      'dialog right edge must be on-screen',
    ).toBeLessThanOrEqual(viewport.width + 1)

    // URL input + copy button must both fit inside the dialog.
    const urlInput = dialog.getByLabel('觀眾連結')
    const copyBtn = dialog.getByRole('button', { name: /複製/ }).first()
    await expect(urlInput).toBeVisible()
    await expect(copyBtn).toBeVisible()

    const copyBox = (await copyBtn.boundingBox())!
    expect(
      copyBox.x + copyBox.width,
      'copy button right edge must be inside dialog',
    ).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1)
  })
})
