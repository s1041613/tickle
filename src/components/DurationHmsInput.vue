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

const hDisplay = computed(() => String(h.value))
const mDisplay = computed(() => String(m.value))
const sDisplay = computed(() => String(s.value))

function onField(field: 'h' | 'm' | 's', e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const v = raw === '' ? 0 : Number(raw)
  setHms({ h: h.value, m: m.value, s: s.value, [field]: v })
}

function onBlur(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.value === '') input.value = '0'
}
</script>

<template>
  <div class="grid grid-cols-3 gap-[0.55rem]">
    <div class="hms-cell">
      <input
        type="number"
        inputmode="numeric"
        min="0"
        max="23"
        :value="hDisplay"
        @input="onField('h', $event)"
        @blur="onBlur"
        class="w-full border-0 bg-transparent text-center text-2xl font-bold text-ink outline-none tabular-nums"
      />
      <span class="hms-unit">時</span>
    </div>
    <div class="hms-cell">
      <input
        type="number"
        inputmode="numeric"
        min="0"
        max="59"
        :value="mDisplay"
        @input="onField('m', $event)"
        @blur="onBlur"
        class="w-full border-0 bg-transparent text-center text-2xl font-bold text-ink outline-none tabular-nums"
      />
      <span class="hms-unit">分</span>
    </div>
    <div class="hms-cell">
      <input
        type="number"
        inputmode="numeric"
        min="0"
        max="59"
        :value="sDisplay"
        @input="onField('s', $event)"
        @blur="onBlur"
        class="w-full border-0 bg-transparent text-center text-2xl font-bold text-ink outline-none tabular-nums"
      />
      <span class="hms-unit">秒</span>
    </div>
  </div>
</template>

<style scoped>
.hms-cell {
  background: var(--color-bg);
  border-radius: 20px;
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
