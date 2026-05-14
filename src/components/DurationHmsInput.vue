<script setup lang="ts">
import { computed } from 'vue'
import { useDurationHms } from '../composables/useDurationHms'

const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [v: number] }>()

const secondsRef = computed({
  get: () => props.modelValue,
  set: (v: number) => emit('update:modelValue', v),
})

const { h, m, s, setHms } = useDurationHms(secondsRef)

function onHour(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  setHms({ h: v, m: m.value, s: s.value })
}

function onMinute(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  setHms({ h: h.value, m: v, s: s.value })
}

function onSecond(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  setHms({ h: h.value, m: m.value, s: v })
}
</script>

<template>
  <div class="grid grid-cols-3 gap-[0.55rem]">
    <div class="hms-cell">
      <input
        type="number"
        min="0"
        max="23"
        :value="h"
        @input="onHour"
        class="w-full border-0 bg-transparent text-center text-2xl font-bold text-ink outline-none tabular-nums"
      />
      <span class="hms-unit">時</span>
    </div>
    <div class="hms-cell">
      <input
        type="number"
        min="0"
        max="59"
        :value="m"
        @input="onMinute"
        class="w-full border-0 bg-transparent text-center text-2xl font-bold text-ink outline-none tabular-nums"
      />
      <span class="hms-unit">分</span>
    </div>
    <div class="hms-cell">
      <input
        type="number"
        min="0"
        max="59"
        :value="s"
        @input="onSecond"
        class="w-full border-0 bg-transparent text-center text-2xl font-bold text-ink outline-none tabular-nums"
      />
      <span class="hms-unit">秒</span>
    </div>
  </div>
</template>

<style scoped>
.hms-cell {
  background: var(--color-bg);
  border-radius: var(--radius-md, 0.75rem);
  padding: 0.85rem 0.6rem 0.7rem;
  text-align: center;
  border: 2px solid transparent;
  transition: border-color 0.15s, background 0.15s;
}

.hms-cell:focus-within {
  border-color: var(--color-orange);
  background: #fff;
}

.hms-cell input::-webkit-outer-spin-button,
.hms-cell input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.hms-cell input[type='number'] {
  -moz-appearance: textfield;
  font-variant-numeric: tabular-nums;
}

.hms-unit {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-muted);
  letter-spacing: 0.05em;
}
</style>
