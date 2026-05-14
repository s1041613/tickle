<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Warning, SoundKey } from './types'
import { useAudio } from './composables/useAudio'
import { useTimer } from './composables/useTimer'
import { useMilestones } from './composables/useMilestones'
import { useUrlSync } from './composables/useUrlSync'
import { useWakeLock } from './composables/useWakeLock'
import { useTabTitle } from './composables/useTabTitle'
import TimerDisplay from './components/TimerDisplay.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import AudioUnlockOverlay from './components/AudioUnlockOverlay.vue'

const duration = ref(300)
const repeat = ref(false)
const warnings = ref<Warning[]>([
  { id: 1, at: 60, color: 'yellow', sound: 'chime' },
  { id: 2, at: 30, color: 'orange', sound: 'bell' },
])
const finalSound = ref<SoundKey>('gong')

const { ensureAudio, playSound, unlocked } = useAudio()
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
      timer.start()
    }, 1500)
  }
})

const panelOpen = ref(false)

async function handleUnlock() {
  await ensureAudio()
  panelOpen.value = true
}

function handleStart() {
  timer.setDuration(duration.value)
  timer.start()
  panelOpen.value = false
}

function handlePause() {
  timer.pause()
}

function handleReset() {
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
  if (s === 'running') return { label: '⏸ 暫停', action: 'pause' as const }
  if (s === 'done') return { label: '▶ 再來一次', action: 'restart' as const }
  if (s === 'paused') return { label: '▶ 繼續', action: 'start' as const }
  return { label: '▶ 開始', action: 'start' as const }
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
</script>

<template>
  <div
    :class="[bodyClass, { 'panel-open': panelOpen }]"
    class="fixed inset-0 transition-colors duration-500"
  >
    <AudioUnlockOverlay v-if="!unlocked" @unlock="handleUnlock" />

    <TimerDisplay
      :formatted="timer.formatted.value"
      :state="visualState"
    />

    <div class="fixed bottom-7 right-7 flex items-center gap-3">
      <button
        @click="handlePrimary"
        class="h-14 px-7 rounded-full border-0 text-base font-bold cursor-pointer shadow-orange hover:shadow-orange-lg hover:-translate-y-0.5 active:translate-y-0 transition-all inline-flex items-center gap-2 min-w-[120px] justify-center"
        :class="visualState === 'done' ? 'bg-white text-orange' : 'bg-orange text-white'"
      >
        {{ primaryButton.label }}
      </button>
      <button
        v-if="timer.status.value === 'paused'"
        @click="handleReset"
        class="h-14 w-14 rounded-full border-0 text-xl font-bold cursor-pointer shadow-card hover:-translate-y-0.5 active:translate-y-0 transition-all inline-flex items-center justify-center bg-white text-ink"
        aria-label="重設"
        title="重設"
      >
        ↻
      </button>
      <button
        @click="panelOpen = true"
        class="h-14 w-14 rounded-full border-0 text-xl font-bold cursor-pointer shadow-card hover:-translate-y-0.5 active:translate-y-0 transition-all inline-flex items-center justify-center"
        :class="visualState === 'done' ? 'bg-white/90 text-orange' : 'bg-white text-ink'"
        aria-label="設定"
        title="設定"
      >
        ⚙
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
      @close="handlePanelClose"
      @update:duration="(v) => (duration = v)"
      @update:repeat="(v) => (repeat = v)"
      @update:warnings="(v) => (warnings = v)"
      @update:final-sound="(v) => (finalSound = v)"
      @test-final="playSound(finalSound)"
    />
  </div>
</template>
