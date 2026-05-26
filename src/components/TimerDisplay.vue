<script setup lang="ts">
import type { TimerState } from '../types'

defineProps<{
  formatted: string
  state: TimerState
  /**
   * Optional small caption rendered below the big number. The host
   * leaves this blank — the main controls + state-coloured background
   * already say enough. The viewer passes "由 host 控制中" so the
   * read-only state is legible without scanning for the badge.
   *
   * (Subtitle text colour follows the timer-state palette so it doesn't
   * clash when the background flips through warn-yellow/orange/red.)
   */
  subtitle?: string
}>()
</script>

<template>
  <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-8 select-none">
    <div
      class="font-black leading-[0.9] tracking-[-0.05em] tabular-nums transition-colors duration-500"
      style="font-size: 28vw; font-family: var(--font-display);"
      :class="{
        'text-ink': state === 'default',
        'text-[var(--color-warn-yellow-text)]': state === 'warn-yellow',
        'text-[var(--color-warn-orange-text)]': state === 'warn-orange',
        'text-[var(--color-warn-red-text)]': state === 'warn-red',
        'text-white': state === 'done',
      }"
    >
      {{ formatted }}
    </div>
    <div
      v-if="subtitle"
      class="mt-4 text-[1.05rem] font-semibold opacity-70 transition-colors duration-500"
      :class="{
        'text-muted': state === 'default',
        'text-[var(--color-warn-yellow-text)]': state === 'warn-yellow',
        'text-[var(--color-warn-orange-text)]': state === 'warn-orange',
        'text-[var(--color-warn-red-text)]': state === 'warn-red',
        'text-white': state === 'done',
      }"
    >
      {{ subtitle }}
    </div>
  </div>
</template>
