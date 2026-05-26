<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Warning, SoundKey } from './types'
import { useAudio } from './composables/useAudio'
import { useTimer } from './composables/useTimer'
import { useMilestones } from './composables/useMilestones'
import {
  loadFromLegacyUrl,
  hasLegacyUrlParams,
  readRoomParam,
  readHostParam,
  writeRoomAndHost,
  clearLegacyUrlParams,
} from './composables/useUrlSync'
import { useRoomSync, type ConnectionMode } from './composables/useRoomSync'
import { useShareLink } from './composables/useShareLink'
import { useWakeLock } from './composables/useWakeLock'
import { useTabTitle } from './composables/useTabTitle'
import { useFullscreen } from './composables/useFullscreen'
import TimerDisplay from './components/TimerDisplay.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import AudioUnlockOverlay from './components/AudioUnlockOverlay.vue'
import ShareButton from './components/ShareButton.vue'
import ShareDialog from './components/ShareDialog.vue'
import RoomNotFoundScreen from './components/RoomNotFoundScreen.vue'
import KickedRibbon from './components/KickedRibbon.vue'
import ViewerBadge from './components/ViewerBadge.vue'
import IconPlay from './components/icons/IconPlay.vue'
import IconPause from './components/icons/IconPause.vue'
import IconReset from './components/icons/IconReset.vue'
import IconSettings from './components/icons/IconSettings.vue'
import type { RoomStatePatch } from '../party/types'

// -------- Settings refs (still the source of truth on host; mirror on viewer) --------
//
// On host: these refs drive the UI; any change is broadcast as a patch.
// On viewer: these refs are hydrated from server `roomState` and never
// written by user input (because UI is disabled). The patch-watcher is
// gated by `isHost` + `applyingFromServer` so server-driven updates
// don't echo back as patches.
const duration = ref(10)
const repeat = ref(false)
const warnings = ref<Warning[]>([
  { id: 1, at: 10, color: 'yellow', sound: 'bell' },
  { id: 2, at: 5, color: 'orange', sound: 'bell' },
  { id: 3, at: 4, color: 'red', sound: 'bell' },
  { id: 4, at: 3, color: 'red', sound: 'bell' },
  { id: 5, at: 2, color: 'red', sound: 'bell' },
  { id: 6, at: 1, color: 'red', sound: 'bell' },
])
const finalSound = ref<SoundKey>('cheer')

// -------- Audio / Timer / Fullscreen wiring --------
const { ensureAudio, playSound, preloadSound, stopAll, unlocked } = useAudio()
const timer = useTimer()
timer.setDuration(duration.value)

watch(duration, (v) => {
  if (timer.status.value === 'idle' || timer.status.value === 'done') {
    timer.setDuration(v)
  }
})

useWakeLock(timer.status)
useTabTitle(timer.formatted, timer.status)
const fullscreen = useFullscreen()

const { visualState } = useMilestones(
  timer.remainSec,
  timer.status,
  warnings,
  (w) => playSound(w.sound),
)

// -------- Room-sync mode selection --------
//
// The URL drives which connection mode we use. Decision tree:
//   - ?room=<id>&host=<token>  → host reconnect (existing room, we have the token)
//   - ?room=<id>               → viewer (existing room, no token = read-only)
//   - no room param            → create a new room. Seed with any legacy
//                                URL params (?seconds=…&warn=…&repeat=…&final=…)
//                                so existing share links stay useful.
function resolveMode(): ConnectionMode {
  const room = readRoomParam()
  const host = readHostParam()
  if (room && host) return { kind: 'host', roomId: room, hostToken: host }
  if (room) return { kind: 'viewer', roomId: room }
  // Create flow — peel any legacy params off into a seed.
  const legacy = hasLegacyUrlParams() ? loadFromLegacyUrl() : {}
  return { kind: 'create', seed: legacy }
}

const initialMode = resolveMode()

// Pre-create flow: apply legacy values locally too, so the very first
// render shows the right duration before the hydrate round-trip
// completes. (Avoids a flash of 5:00 → 10:00.)
if (initialMode.kind === 'create' && initialMode.seed) {
  const seed = initialMode.seed
  if (seed.duration !== undefined) {
    duration.value = seed.duration
    timer.setDuration(seed.duration)
  }
  if (seed.repeat !== undefined) repeat.value = seed.repeat
  if (seed.warnings !== undefined) warnings.value = seed.warnings
  if (seed.finalSound !== undefined) finalSound.value = seed.finalSound
}

// Toast state for the "room not found" + "kicked" placeholders.
// FE-7 will replace these with proper components (RoomNotFoundScreen,
// KickedRibbon). For now they're just visible state we render inline.
const roomNotFound = ref(false)
const kicked = ref(false)
const kickedDismissed = ref(false) // user clicked X on the ribbon

const room = useRoomSync({
  mode: initialMode,
  onCreated: ({ roomId, hostToken }) => {
    // First successful create — pin the room id + host token to the URL
    // so reload / share-link both work. clearLegacyUrlParams is a
    // belt-and-braces no-op when there were no legacy params.
    writeRoomAndHost(roomId, hostToken)
    clearLegacyUrlParams()
    // Both calls above used history.replaceState, which doesn't fire
    // `popstate` — manually nudge useShareLink so the viewer URL it
    // hands out reflects the new `?room=...` we just pinned.
    share.refresh()
  },
  onKicked: () => {
    kicked.value = true
    // Stop any running audio so the user isn't bombarded with a warning
    // that the new host is also about to play.
    stopAll()
  },
  onRoomNotFound: () => {
    // Just set the flag — RoomNotFoundScreen.vue owns the countdown +
    // the eventual `window.location.href = pathname` navigation. Keeps
    // the lifecycle in one place so we don't end up with two competing
    // timers.
    roomNotFound.value = true
  },
})

// -------- Map server state → local refs (and timer) --------
//
// `applyingFromServer` is the echo-suppression guard: when we mutate the
// local settings refs because the server told us to, we don't want the
// host watcher (further down) to immediately send a patch back. We flip
// this flag before assignment and reset it on nextTick.
let applyingFromServer = false

function shallowSameWarnings(
  a: readonly Warning[],
  b: readonly Warning[],
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].at !== b[i].at ||
      a[i].color !== b[i].color ||
      a[i].sound !== b[i].sound
    ) return false
  }
  return true
}

watch(
  () => room.roomState.value,
  (state, prev) => {
    if (!state) return
    applyingFromServer = true
    try {
      // Settings refs — only update if value actually changed (the
      // identity-check avoids triggering downstream watchers needlessly).
      if (state.duration !== duration.value) duration.value = state.duration
      if (state.repeat !== repeat.value) repeat.value = state.repeat
      if (!shallowSameWarnings(state.warnings, warnings.value)) {
        // RoomState is readonly (shallowRef); spread into a mutable
        // copy before assigning to a Ref<Warning[]>.
        warnings.value = state.warnings.map((w) => ({ ...w }))
      }
      if (state.finalSound !== finalSound.value) finalSound.value = state.finalSound

      // Timer state — keep the local timer in sync. Host normally already
      // matches because host drives the changes; this branch is mostly
      // for the viewer + reconnect-hydrate cases.
      const prevStatus = prev?.status
      const justStartedRunning =
        state.status === 'running' &&
        state.endAtMs !== null &&
        (prevStatus !== 'running' || prev?.endAtMs !== state.endAtMs)

      if (justStartedRunning && state.endAtMs !== null) {
        // Convert the server's absolute endAtMs into the client's clock
        // frame using the measured offset, then hand off to the timer.
        // We rebuild the local timer's totalSec from `duration` so the
        // pause/resume path stays consistent.
        timer.setDuration(state.duration)
        const localEndAt = state.endAtMs - room.clockOffset.value
        timer.startWithEndAt(localEndAt)
      } else if (state.status === 'paused' && prevStatus !== 'paused') {
        // Pause sync — only the local timer.pause() needs calling. The
        // pausedRemainSec we already mirror via the local timer's own
        // tick(), no extra math needed here.
        if (timer.status.value === 'running') timer.pause()
      } else if (state.status === 'idle' && prevStatus !== 'idle') {
        // Reset sync
        if (timer.status.value !== 'idle') timer.reset()
      }
    } finally {
      // Defer the flag reset to next microtask so any reactive watchers
      // triggered by the assignments above also see `applyingFromServer = true`.
      queueMicrotask(() => {
        applyingFromServer = false
      })
    }
  },
  { immediate: false },
)

// -------- Host → patch wiring --------
//
// Host watches every settings ref + key timer events and broadcasts
// patches. The `applyingFromServer` guard prevents echo loops; the
// `isHost` guard makes the watchers no-op on viewer.

function patchIfHost(changes: RoomStatePatch): void {
  if (applyingFromServer) return
  if (!room.isHost.value) return
  // sendPatch internally double-checks isHost + roomState, so this is
  // defensive belt-and-braces.
  room.sendPatch(changes)
}

watch(duration, (v) => patchIfHost({ duration: v }))
watch(repeat, (v) => patchIfHost({ repeat: v }))
watch(warnings, (v) => patchIfHost({ warnings: v }), { deep: true })
watch(finalSound, (v) => patchIfHost({ finalSound: v }))

// -------- Done callback (host only triggers the looped restart) --------
timer.onDone(() => {
  playSound(finalSound.value)
  if (!room.isHost.value) return // viewer auto-loops only when host's broadcast says so
  if (repeat.value) {
    setTimeout(() => {
      stopAll()
      timer.start()
      // Tell viewers about the fresh endAtMs.
      const endAt = Date.now() + (duration.value * 1000) + room.clockOffset.value
      patchIfHost({ status: 'running', endAtMs: endAt, pausedRemainSec: null })
    }, 1500)
  } else {
    patchIfHost({ status: 'done' })
  }
})

// -------- UI controls --------

const panelOpen = ref(false)

// Disable user interaction whenever the local tab can't write to the
// room. That's both pure viewer mode AND a host that just got kicked
// (we keep listening so they can see the room but they can't drive it).
const isControlsDisabled = computed(() => !room.isHost.value)

async function handleUnlock() {
  await ensureAudio()
  warnings.value.forEach((w) => preloadSound(w.sound))
  preloadSound(finalSound.value)
  // Only open the settings panel on initial unlock for hosts. Viewers
  // can still open it via the gear button — but at unlock time we want
  // to keep their first impression clean.
  if (room.isHost.value) panelOpen.value = true
}

function handleStart() {
  if (isControlsDisabled.value) return
  stopAll()
  timer.setDuration(duration.value)
  timer.start()
  panelOpen.value = false
  // Push the new endAtMs to the server, expressed in server time.
  const endAt = Date.now() + (duration.value * 1000) + room.clockOffset.value
  patchIfHost({ status: 'running', endAtMs: endAt, pausedRemainSec: null })
}

function handlePause() {
  if (isControlsDisabled.value) return
  stopAll()
  timer.pause()
  // Communicate the paused remaining time in the patch so viewers can
  // render the right "frozen at X:YY" display after reconnect.
  patchIfHost({
    status: 'paused',
    pausedRemainSec: timer.remainSec.value,
    endAtMs: null,
  })
}

function handleReset() {
  if (isControlsDisabled.value) return
  stopAll()
  timer.reset()
  timer.setDuration(duration.value)
  patchIfHost({ status: 'idle', endAtMs: null, pausedRemainSec: null })
}

function handlePanelClose() {
  if (timer.status.value === 'done') {
    handleReset()
  }
  panelOpen.value = false
}

const primaryButton = computed(() => {
  const s = timer.status.value
  if (s === 'running') return { icon: 'pause' as const, text: '暫停', action: 'pause' as const }
  if (s === 'done') return { icon: 'play' as const, text: '再來一次', action: 'restart' as const }
  if (s === 'paused') return { icon: 'play' as const, text: '繼續', action: 'start' as const }
  return { icon: 'play' as const, text: '開始', action: 'start' as const }
})

function handlePrimary() {
  if (isControlsDisabled.value) return
  const a = primaryButton.value.action
  if (a === 'start') handleStart()
  else if (a === 'pause') handlePause()
  else if (a === 'restart') {
    handleReset()
    handleStart()
  }
}

const bodyClass = computed(() => `state-${visualState.value}`)
const pointerInside = ref(false)

// `isViewer` distinguishes "pure viewer (no host token)" from "kicked
// host". Used for the VIEWER badge — kicked tabs get the ribbon
// instead. (FE-7 may add a viewer-only subtitle on TimerDisplay using
// this same computed.)
const isViewer = computed(() => !room.isHost.value && !kicked.value)

// Kicked-ribbon visibility — show ribbon while kicked AND user hasn't
// manually dismissed it this session.
const showKickedRibbon = computed(() => kicked.value && !kickedDismissed.value)

// -------- Template-callable helpers --------
//
// Vue templates can't reach globals like `window` / `navigator` unless
// they're exposed on the script-setup scope. Wrapping the calls in
// dedicated methods keeps the template lean and gives us a single
// place to swap implementations (e.g. once `useShareLink` lands in FE-8).

function handleKickedGoHome(): void {
  // Strip room/host params so the next visit goes through create flow.
  window.location.href = window.location.pathname
}

// -------- Share dialog state --------
//
// `useShareLink` owns the viewer URL + clipboard state machine; this
// layer just wires it to the dialog's open/copied props.
const share = useShareLink()
const shareOpen = ref(false)
// Derive `copied` from the composable's state machine. The dialog
// expects a plain boolean; mapping a 4-state machine to one bool is
// fine here because `error` and `idle` look identical to the UI.
const shareCopied = computed(() => share.copyState.value === 'copied')

function openShareDialog(): void {
  // Ensure the URL is fresh in case the room was created moments ago
  // and any other history mutation slipped through. Cheap call.
  share.refresh()
  shareOpen.value = true
}

function closeShareDialog(): void {
  shareOpen.value = false
}

async function handleShareCopy(): Promise<void> {
  await share.copyToClipboard()
}
</script>

<template>
  <div
    :class="[bodyClass, { 'panel-open': panelOpen, 'is-viewer': isViewer, 'is-kicked': kicked }]"
    class="fixed inset-0 transition-colors duration-500"
    @mouseenter="pointerInside = true"
    @mouseleave="pointerInside = false"
  >
    <AudioUnlockOverlay v-if="!unlocked" @unlock="handleUnlock" />

    <!-- Kicked: this tab was the host but got replaced by a newer tab.
         Shows a yellow ribbon at top edge — NOT modal so the timer
         (which may still be running, broadcast by the new host) stays
         readable underneath. -->
    <KickedRibbon
      v-if="showKickedRibbon"
      @go-home="handleKickedGoHome"
      @dismiss="kickedDismissed = true"
    />

    <!-- Room not found: viewer pointed at a non-existent room. The
         component owns its own 3s countdown + redirect-to-home. -->
    <RoomNotFoundScreen v-if="roomNotFound" />

    <!-- VIEWER identity pill (top-left). Only renders when this tab is
         a pure viewer; kicked hosts get the ribbon at top instead. -->
    <ViewerBadge v-if="isViewer" />

    <TimerDisplay
      :formatted="timer.formatted.value"
      :state="visualState"
      :subtitle="isViewer ? '由 host 控制中' : ''"
    />

    <Transition
      enter-active-class="transition-opacity duration-300"
      leave-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <button
        v-if="fullscreen.isSupported.value && pointerInside"
        @click="fullscreen.toggle()"
        class="fs-btn fixed top-7 right-7 h-11 w-11 rounded-full border-0 cursor-pointer inline-flex items-center justify-center"
        :aria-label="fullscreen.isFullscreen.value ? '退出全螢幕' : '進入全螢幕'"
        :title="fullscreen.isFullscreen.value ? '退出全螢幕' : '進入全螢幕'"
      >
        <svg v-if="!fullscreen.isFullscreen.value" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
        <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        </svg>
      </button>
    </Transition>

    <!-- Host-only share trigger (bottom-left). Conditional rendering
         lives here so the dialog state can stay paired with the parent.
         FE-8 will wire useShareLink in; for now the dialog opens via
         openShareDialog() and the copy itself is hand-rolled. -->
    <ShareButton
      v-if="room.isHost.value && !kicked"
      @click="openShareDialog"
    />

    <div class="fixed bottom-7 right-7 flex items-center gap-3">
      <button
        @click="handlePrimary"
        :disabled="isControlsDisabled"
        :aria-disabled="isControlsDisabled || undefined"
        class="h-14 px-7 rounded-full border-0 text-base font-bold cursor-pointer shadow-orange hover:shadow-orange-lg hover:-translate-y-0.5 active:translate-y-0 transition-all inline-flex items-center gap-2 min-w-[120px] justify-center disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none disabled:saturate-[0.4]"
        :class="visualState === 'done' ? 'bg-white text-orange' : 'bg-orange text-white'"
      >
        <IconPlay v-if="primaryButton.icon === 'play'" class="w-5 h-5" />
        <IconPause v-else class="w-5 h-5" />
        <span>{{ primaryButton.text }}</span>
      </button>
      <button
        v-if="timer.status.value === 'paused' || timer.status.value === 'done'"
        @click="handleReset"
        :disabled="isControlsDisabled"
        :aria-disabled="isControlsDisabled || undefined"
        class="h-14 w-14 rounded-full border-0 cursor-pointer shadow-card hover:-translate-y-0.5 active:translate-y-0 transition-all inline-flex items-center justify-center disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none disabled:saturate-[0.4]"
        :class="visualState === 'done' ? 'bg-white/90 text-orange' : 'bg-white text-muted'"
        aria-label="重設"
        title="重設"
      >
        <IconReset class="w-5 h-5" />
      </button>
      <button
        @click="panelOpen = true"
        class="h-14 w-14 rounded-full border-0 cursor-pointer shadow-card hover:-translate-y-0.5 active:translate-y-0 transition-all inline-flex items-center justify-center"
        :class="visualState === 'done' ? 'bg-white/90 text-orange' : 'bg-white text-muted'"
        aria-label="設定"
        title="設定"
      >
        <IconSettings class="w-5 h-5" />
      </button>
    </div>

    <Transition
      enter-active-class="transition-opacity duration-300"
      leave-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="panelOpen"
        @click="handlePanelClose"
        class="fixed inset-0 bg-black/40 z-[5]"
        aria-hidden="true"
      ></div>
    </Transition>

    <!-- SettingsPanel owns its own viewer-hint banner + readonly
         styling now (see SettingsPanel.vue's `readOnly` prop). The
         wrapper div is gone — no more CSS sledgehammer. -->
    <SettingsPanel
      :open="panelOpen"
      :duration="duration"
      :repeat="repeat"
      :warnings="warnings"
      :final-sound="finalSound"
      :play-sound="playSound"
      :preload-sound="preloadSound"
      :read-only="isControlsDisabled"
      @close="handlePanelClose"
      @update:duration="(v) => (duration = v)"
      @update:repeat="(v) => (repeat = v)"
      @update:warnings="(v) => (warnings = v)"
      @update:final-sound="(v) => (finalSound = v)"
    />

    <!-- Share dialog: rendered once at root level, controlled by
         openShareDialog / closeShareDialog. ShareDialog teleports itself
         to <body>, so this position in the tree is purely organizational. -->
    <ShareDialog
      :open="shareOpen"
      :viewer-url="share.viewerUrl.value"
      :copied="shareCopied"
      @close="closeShareDialog"
      @copy="handleShareCopy"
    />
  </div>
</template>

<style scoped>
/* Disabled-state utilities used inline. Tailwind doesn't ship these
 * exact percentages (45% / 40% saturation), so they're declared at
 * component scope and target the inline `disabled:` selectors. */
:deep(.disabled\:opacity-45:disabled) {
  opacity: 0.45;
}
:deep(.disabled\:saturate-\[0\.4\]:disabled) {
  filter: saturate(0.4);
}
</style>
