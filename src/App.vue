<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Warning, SoundKey } from './types'
import { useAudio } from './composables/useAudio'
import { useTimer } from './composables/useTimer'
import { useMilestones } from './composables/useMilestones'
import { useUrlSync } from './composables/useUrlSync'
import { useWakeLock } from './composables/useWakeLock'
import { useTabTitle } from './composables/useTabTitle'
import { useFullscreen } from './composables/useFullscreen'
import TimerDisplay from './components/TimerDisplay.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import AudioUnlockOverlay from './components/AudioUnlockOverlay.vue'
import IconPlay from './components/icons/IconPlay.vue'
import IconPause from './components/icons/IconPause.vue'
import IconReset from './components/icons/IconReset.vue'
import IconSettings from './components/icons/IconSettings.vue'

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

const { ensureAudio, playSound, preloadSound, stopAll, unlocked } = useAudio()
const timer = useTimer()

// Apply initial duration so the display shows the right value on first paint.
timer.setDuration(duration.value)

// When user edits duration in the settings panel and the timer is not running,
// reflect it on the main display immediately.
watch(duration, (v) => {
  if (timer.status.value === 'idle' || timer.status.value === 'done') {
    timer.setDuration(v)
  }
})

useUrlSync({ duration, repeat, warnings, finalSound })
useWakeLock(timer.status)
useTabTitle(timer.formatted, timer.status)
const fullscreen = useFullscreen()

const { visualState } = useMilestones(
  timer.remainSec,
  timer.status,
  warnings,
  (w) => playSound(w.sound),
)

timer.onDone(() => {
  playSound(finalSound.value)
  if (repeat.value) {
    setTimeout(() => {
      // Silence any final-sound tail (e.g. a long clap) before the next run
      // begins, so audio never bleeds across runs.
      stopAll()
      timer.start()
    }, 1500)
  }
})

const panelOpen = ref(false)

async function handleUnlock() {
  await ensureAudio()
  // If the URL pre-loaded a clap sound (e.g. shared link), warm its buffer now
  // so the first warning trigger doesn't fall back to bell.
  warnings.value.forEach((w) => preloadSound(w.sound))
  preloadSound(finalSound.value)
  panelOpen.value = true
}

function handleStart() {
  stopAll()
  timer.setDuration(duration.value)
  timer.start()
  panelOpen.value = false
}

function handlePause() {
  stopAll()
  timer.pause()
}

function handleReset() {
  stopAll()
  timer.reset()
  timer.setDuration(duration.value)
}

// When user closes the settings panel, if the timer is in 'done' state,
// reset it to 'idle' so the main button shows '開始' (a fresh start) rather
// than '再來一次' (which implies repeating the previous run).
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
</script>

<template>
  <div
    :class="[bodyClass, { 'panel-open': panelOpen }]"
    class="fixed inset-0 transition-colors duration-500"
    @mouseenter="pointerInside = true"
    @mouseleave="pointerInside = false"
  >
    <AudioUnlockOverlay v-if="!unlocked" @unlock="handleUnlock" />

    <TimerDisplay
      :formatted="timer.formatted.value"
      :state="visualState"
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

    <div class="fixed bottom-7 right-7 flex items-center gap-3">
      <button
        @click="handlePrimary"
        class="h-14 px-7 rounded-full border-0 text-base font-bold cursor-pointer shadow-orange hover:shadow-orange-lg hover:-translate-y-0.5 active:translate-y-0 transition-all inline-flex items-center gap-2 min-w-[120px] justify-center"
        :class="visualState === 'done' ? 'bg-white text-orange' : 'bg-orange text-white'"
      >
        <IconPlay v-if="primaryButton.icon === 'play'" class="w-5 h-5" />
        <IconPause v-else class="w-5 h-5" />
        <span>{{ primaryButton.text }}</span>
      </button>
      <button
        v-if="timer.status.value === 'paused' || timer.status.value === 'done'"
        @click="handleReset"
        class="h-14 w-14 rounded-full border-0 cursor-pointer shadow-card hover:-translate-y-0.5 active:translate-y-0 transition-all inline-flex items-center justify-center"
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

    <SettingsPanel
      :open="panelOpen"
      :duration="duration"
      :repeat="repeat"
      :warnings="warnings"
      :final-sound="finalSound"
      :play-sound="playSound"
      :preload-sound="preloadSound"
      @close="handlePanelClose"
      @update:duration="(v) => (duration = v)"
      @update:repeat="(v) => (repeat = v)"
      @update:warnings="(v) => (warnings = v)"
      @update:final-sound="(v) => (finalSound = v)"
    />
  </div>
</template>
