import { test, expect, type Page } from '@playwright/test'

// Spin up a 2-second timer via URL, click through audio overlay, hit start,
// and wait for the "done" state to appear. Used as a setup helper.
async function gotoAndFinish(page: Page) {
  await page.goto('/tickle/?seconds=2&final=cheer')
  await page.getByText('點一下螢幕').click({ trial: false }).catch(() => {})
  // Hosts get the settings panel auto-opened after the audio unlock.
  // Dismiss it so the main controls are interactable.
  await page.getByRole('button', { name: '關閉' }).click({ trial: false }).catch(() => {})
  await page.getByRole('button', { name: '開始' }).click()
  // Wait for done state: primary button text changes to「再來一次」.
  await expect(page.getByRole('button', { name: /再來一次/ })).toBeVisible({
    timeout: 8_000,
  })
}

test.describe('end-screen (done state)', () => {
  test('B1: background should be orange (not white/inverted) in done state', async ({ page }) => {
    await gotoAndFinish(page)
    // The .state-done class lives on the top-level <div> inside #app.
    const root = page.locator('.state-done').first()
    await expect(root).toBeVisible()
    const bg = await root.evaluate((el) => {
      return getComputedStyle(el as HTMLElement).backgroundColor
    })
    // pulse keyframes oscillate between rgb(255,107,61) and rgb(255,138,92);
    // both have R > G+50 and G > B → unambiguously orange. White would be
    // rgb(255,255,255), so we assert R is high AND G is much less than R.
    const m = bg.match(/\d+/g)
    expect(m, `background-color was ${bg}`).not.toBeNull()
    const [r, g, b] = m!.map(Number)
    expect(r, `R should be ~255, got ${bg}`).toBeGreaterThan(240)
    expect(g, `G should be much less than R (orange), got ${bg}`).toBeLessThan(r - 80)
    expect(b, `B should be much less than R (orange), got ${bg}`).toBeLessThan(r - 80)
  })

  test('B4: reset button should be visible in done state', async ({ page }) => {
    await gotoAndFinish(page)
    await expect(page.getByRole('button', { name: '重設' })).toBeVisible()
  })

  test('B6: buttons should not animate; only background pulses', async ({ page }) => {
    await gotoAndFinish(page)
    // Background root has the pulse animation.
    const root = page.locator('.state-done').first()
    const rootAnim = await root.evaluate((el) =>
      getComputedStyle(el as HTMLElement).animationName,
    )
    expect(rootAnim, 'root should pulse').toBe('pulse')

    // Primary button: should not have a transform/scale animation running.
    const primary = page.getByRole('button', { name: /再來一次/ })
    const primaryAnim = await primary.evaluate((el) =>
      getComputedStyle(el as HTMLElement).animationName,
    )
    expect(primaryAnim, 'primary button must not animate').toBe('none')

    const reset = page.getByRole('button', { name: '重設' })
    const resetAnim = await reset.evaluate((el) =>
      getComputedStyle(el as HTMLElement).animationName,
    )
    expect(resetAnim, 'reset button must not animate').toBe('none')

    const settings = page.getByRole('button', { name: '設定' }).first()
    const settingsAnim = await settings.evaluate((el) =>
      getComputedStyle(el as HTMLElement).animationName,
    )
    expect(settingsAnim, 'settings button must not animate').toBe('none')

    // Also verify visually: snapshot the buttons twice, 300ms apart, and ensure
    // their bounding boxes haven't moved. (transform animation would shift them.)
    const boxesBefore = await Promise.all([
      primary.boundingBox(),
      reset.boundingBox(),
      settings.boundingBox(),
    ])
    await page.waitForTimeout(400)
    const boxesAfter = await Promise.all([
      primary.boundingBox(),
      reset.boundingBox(),
      settings.boundingBox(),
    ])
    for (let i = 0; i < boxesBefore.length; i++) {
      expect(boxesAfter[i]?.x, `button ${i} x drift`).toBeCloseTo(boxesBefore[i]!.x, 0)
      expect(boxesAfter[i]?.y, `button ${i} y drift`).toBeCloseTo(boxesBefore[i]!.y, 0)
    }
  })
})
