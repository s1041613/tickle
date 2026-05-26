/**
 * Share-link clipboard helper.
 *
 * Surface:
 *   - `viewerUrl`     readonly Ref<string>, the URL without `host` param
 *   - `copyState`     readonly Ref<'idle' | 'copying' | 'copied' | 'error'>
 *   - `copyToClipboard()`  attempts to write `viewerUrl` to clipboard,
 *                          flips state through copying → copied|error,
 *                          and auto-resets to `idle` after 1.5s
 *   - `refresh()`     re-read `window.location` (call after a programmatic
 *                     `history.replaceState` so the computed catches up)
 *
 * Why a manual `refresh()` instead of polling / popstate-only:
 *   `history.replaceState` doesn't fire `popstate`, and we don't want to
 *   poll the URL every frame. The host-create flow knows exactly when
 *   it rewrites the URL (`writeRoomAndHost`), so it can `refresh()`
 *   then. `popstate` is still wired for back/forward in case anyone
 *   ever navigates within the SPA.
 *
 * Per CLAUDE.md "不能反向 import 其他 composable" — this file imports
 * nothing from `./*`. It does call out to `readRoomParam` indirectly
 * (re-implements the URL stripping locally to avoid the dep). Trade-off:
 * a tiny bit of duplication for a clear no-cross-import surface.
 */
import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

export type CopyState = 'idle' | 'copying' | 'copied' | 'error'

export interface UseShareLinkOptions {
  /**
   * Override how long the `copied` state lingers before resetting to
   * `idle`. Tests pass a smaller value; default matches ShareDialog's
   * own toast timing so the two stay in sync.
   */
  copiedResetMs?: number
}

/**
 * Strip the `host` query param from a URL string, return the resulting
 * URL. If the URL has no `host` param, returns it unchanged. If the URL
 * is malformed, falls back to the input.
 *
 * Pure function — exported for tests.
 */
export function stripHostParam(fullUrl: string): string {
  try {
    const u = new URL(fullUrl)
    if (!u.searchParams.has('host')) return fullUrl
    u.searchParams.delete('host')
    // Preserve the original origin + path + remaining search + hash.
    return u.toString()
  } catch {
    return fullUrl
  }
}

/**
 * Build the viewer URL from the current `window.location`. Separated
 * from `useShareLink` so unit tests can drive it directly without
 * mounting a component.
 */
function readViewerUrl(): string {
  return stripHostParam(window.location.href)
}

export function useShareLink(options: UseShareLinkOptions = {}) {
  const resetMs = options.copiedResetMs ?? 1500

  const viewerUrl = ref<string>(readViewerUrl())
  const copyState = ref<CopyState>('idle')

  let resetTimer: number | null = null

  /** Re-read the URL. Call after a programmatic history mutation. */
  function refresh(): void {
    viewerUrl.value = readViewerUrl()
  }

  function clearResetTimer(): void {
    if (resetTimer != null) {
      clearTimeout(resetTimer)
      resetTimer = null
    }
  }

  function scheduleReset(): void {
    clearResetTimer()
    resetTimer = window.setTimeout(() => {
      copyState.value = 'idle'
      resetTimer = null
    }, resetMs)
  }

  /**
   * Write the current `viewerUrl` to the system clipboard. Returns
   * `true` on success, `false` on failure (permission denied, insecure
   * context, no API). State transitions:
   *
   *   idle → copying → copied (1.5s) → idle
   *   idle → copying → error   (1.5s) → idle
   *
   * The state-then-callback pattern matches what ShareDialog expects:
   * it watches the `copied` boolean derived from `copyState === 'copied'`
   * and runs its own visual feedback timer.
   */
  async function copyToClipboard(): Promise<boolean> {
    const url = viewerUrl.value
    if (!url) {
      // Nothing to copy yet — caller probably hit this before the room
      // was created. Surface as error so the UI can react.
      copyState.value = 'error'
      scheduleReset()
      return false
    }

    copyState.value = 'copying'

    // Prefer the async Clipboard API. It only works in secure contexts
    // (HTTPS or localhost) and may be denied by user permission.
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        copyState.value = 'copied'
        scheduleReset()
        return true
      } catch (err) {
        // Permission denied or some other Clipboard API failure. Fall
        // through to the legacy fallback before giving up.
        console.warn('[tickle/useShareLink] clipboard API failed, trying fallback', err)
      }
    }

    // Legacy fallback: temporarily mount a <textarea>, select it, exec
    // copy, remove it. Works on older iPad Safari + on HTTP origins
    // where the modern API is gated.
    const ok = legacyCopyFallback(url)
    if (ok) {
      copyState.value = 'copied'
      scheduleReset()
      return true
    }

    copyState.value = 'error'
    scheduleReset()
    return false
  }

  function onPopState(): void {
    refresh()
  }

  // Mount/unmount: keep the viewer URL in sync with browser navigation.
  // We register lazily so this composable stays test-friendly when called
  // outside a component (the `onMounted`/`onBeforeUnmount` calls are
  // no-ops in that case).
  onMounted(() => {
    window.addEventListener('popstate', onPopState)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('popstate', onPopState)
    clearResetTimer()
  })

  return {
    viewerUrl: readonly(viewerUrl),
    copyState: readonly(copyState),
    copyToClipboard,
    refresh,
  }
}

/**
 * Hidden-textarea fallback for browsers / contexts where
 * `navigator.clipboard.writeText` isn't available or is denied.
 *
 * Implementation notes:
 *   - position: fixed + opacity 0 keeps it out of the layout
 *   - read-only prevents iOS Safari from popping up the keyboard
 *   - we explicitly call select() rather than relying on focus, because
 *     iPad Safari has historically been fussy here
 *   - document.execCommand('copy') is deprecated but still implemented
 *     in every browser as of 2026; that's the right call until support
 *     genuinely disappears.
 */
function legacyCopyFallback(text: string): boolean {
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  ta.style.pointerEvents = 'none'
  document.body.appendChild(ta)
  try {
    ta.select()
    ta.setSelectionRange(0, text.length)
    // execCommand is deprecated but no other sync alternative exists.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(ta)
  }
}
