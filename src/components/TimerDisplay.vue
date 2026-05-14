<script setup lang="ts">
import type { TimerState } from '../types'

defineProps<{
  formatted: string
  state: TimerState
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
  </div>
</template>
