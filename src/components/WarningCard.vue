<script setup lang="ts">
import type { Warning, ColorKey, SoundKey } from '../types'
import { COLOR_LABELS, SOUND_LABELS } from '../types'

const props = defineProps<{ warning: Warning }>()
const emit = defineEmits<{
  'update:warning': [w: Warning]
  delete: [id: number]
}>()

const colorKeys = Object.keys(COLOR_LABELS) as ColorKey[]
const soundKeys = Object.keys(SOUND_LABELS) as SoundKey[]

function updateAt(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v) && v > 0) {
    emit('update:warning', { ...props.warning, at: Math.floor(v) })
  }
}

function updateColor(e: Event) {
  const v = (e.target as HTMLSelectElement).value as ColorKey
  emit('update:warning', { ...props.warning, color: v })
}

function updateSound(e: Event) {
  const v = (e.target as HTMLSelectElement).value as SoundKey
  emit('update:warning', { ...props.warning, sound: v })
}
</script>

<template>
  <div class="bg-bg rounded-[20px] p-[0.85rem] mb-[0.6rem] grid grid-cols-[90px_1fr_1fr_36px] gap-2 items-center">
    <input
      type="number"
      :value="warning.at"
      min="1"
      @input="updateAt"
      class="bg-white border-0 p-[0.6rem] rounded-[14px] font-bold text-center text-base"
    />
    <select
      :value="warning.color"
      @change="updateColor"
      class="bg-white border-0 px-3 py-[0.6rem] rounded-[14px] font-semibold text-sm cursor-pointer"
    >
      <option v-for="k in colorKeys" :key="k" :value="k">{{ COLOR_LABELS[k] }}</option>
    </select>
    <select
      :value="warning.sound"
      @change="updateSound"
      class="bg-white border-0 px-3 py-[0.6rem] rounded-[14px] font-semibold text-sm cursor-pointer"
    >
      <option v-for="k in soundKeys" :key="k" :value="k">{{ SOUND_LABELS[k] }}</option>
    </select>
    <button
      @click="emit('delete', warning.id)"
      class="w-9 h-9 rounded-full bg-white text-muted border-0 cursor-pointer text-base hover:bg-orange-soft hover:text-orange transition-colors"
      aria-label="刪除"
    >
      ✕
    </button>
  </div>
</template>
