<script setup lang="ts">
import type { Warning, ColorKey, SoundKey } from '../types'
import { COLOR_LABELS, SOUND_LABELS } from '../types'

const props = defineProps<{
  warning: Warning
  isPlaying?: boolean
}>()

const emit = defineEmits<{
  'update:warning': [w: Warning]
  delete: [id: number]
  preview: [w: Warning]
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
  <div
    class="warn-card bg-bg rounded-[20px] p-[0.7rem_0.7rem_0.7rem_0.4rem] mb-[0.55rem] grid gap-[0.4rem] items-center border-2 border-transparent transition-[box-shadow,transform,border-color] duration-[0.18s]"
    style="grid-template-columns: 22px 64px 1fr 1fr 34px 30px"
  >
    <!-- Col 1: Grip -->
    <div class="grip flex items-center justify-center text-[#C9BDB1] cursor-grab transition-colors duration-150 hover:text-orange" title="拖曳排序">
      <svg viewBox="0 0 12 18" width="12" height="18" style="display:block">
        <circle cx="3" cy="3" r="1.5" fill="currentColor"/>
        <circle cx="9" cy="3" r="1.5" fill="currentColor"/>
        <circle cx="3" cy="9" r="1.5" fill="currentColor"/>
        <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
        <circle cx="3" cy="15" r="1.5" fill="currentColor"/>
        <circle cx="9" cy="15" r="1.5" fill="currentColor"/>
      </svg>
    </div>

    <!-- Col 2: Seconds input -->
    <input
      type="number"
      :value="warning.at"
      min="1"
      @input="updateAt"
      class="bg-white border-0 py-[0.55rem] px-[0.3rem] rounded-[14px] font-bold text-center text-base text-ink outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />

    <!-- Col 3: Color select (tinted) -->
    <select
      :value="warning.color"
      @change="updateColor"
      class="warn-select border-0 rounded-[14px] py-[0.55rem] pl-[0.7rem] pr-[1.4rem] font-semibold text-[0.85rem] cursor-pointer outline-none w-full min-w-0"
      :class="`color-${warning.color}`"
    >
      <option v-for="k in colorKeys" :key="k" :value="k">{{ COLOR_LABELS[k] }}</option>
    </select>

    <!-- Col 4: Sound select -->
    <select
      :value="warning.sound"
      @change="updateSound"
      class="warn-select warn-select-sound border-0 rounded-[14px] py-[0.55rem] pl-[0.7rem] pr-[1.4rem] font-semibold text-[0.85rem] cursor-pointer outline-none w-full min-w-0"
    >
      <option v-for="k in soundKeys" :key="k" :value="k">{{ SOUND_LABELS[k] }}</option>
    </select>

    <!-- Col 5: Preview button -->
    <button
      type="button"
      class="preview-btn"
      :class="{ playing: isPlaying }"
      @click="emit('preview', warning)"
      :title="isPlaying ? '試聽中' : '試聽'"
      :aria-label="isPlaying ? '試聽中' : '試聽'"
    >
      <template v-if="!isPlaying">
        <!-- Play triangle -->
        <svg viewBox="0 0 12 12">
          <path d="M3 1 L10 6 L3 11 Z" fill="currentColor"/>
        </svg>
      </template>
      <template v-else>
        <!-- Pause bars -->
        <svg viewBox="0 0 12 12">
          <rect x="3" y="3" width="2" height="6" fill="currentColor"/>
          <rect x="7" y="3" width="2" height="6" fill="currentColor"/>
        </svg>
      </template>
    </button>

    <!-- Col 6: Delete button -->
    <button
      type="button"
      @click="emit('delete', warning.id)"
      class="w-[30px] h-[30px] rounded-full bg-transparent text-muted border-0 cursor-pointer text-[0.95rem] flex items-center justify-center transition-colors hover:bg-white hover:text-red"
      aria-label="刪除"
    >
      ✕
    </button>
  </div>
</template>
