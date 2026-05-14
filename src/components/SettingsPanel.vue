<script setup lang="ts">
import { ref } from 'vue'
import type { Warning, SoundKey } from '../types'
import { SOUND_LABELS } from '../types'
import SectionTag from './SectionTag.vue'
import ToggleSwitch from './ToggleSwitch.vue'
import WarningCard from './WarningCard.vue'
import DurationHmsInput from './DurationHmsInput.vue'

const props = defineProps<{
  open: boolean
  duration: number
  repeat: boolean
  warnings: Warning[]
  finalSound: SoundKey
  playSound: (kind: SoundKey) => void
}>()

const emit = defineEmits<{
  close: []
  'update:duration': [v: number]
  'update:repeat': [v: boolean]
  'update:warnings': [v: Warning[]]
  'update:finalSound': [v: SoundKey]
}>()

const soundKeys = Object.keys(SOUND_LABELS) as SoundKey[]

const PRESETS = [
  { seconds: 60, label: '1 分' },
  { seconds: 300, label: '5 分' },
  { seconds: 600, label: '10 分' },
  { seconds: 900, label: '15 分' },
  { seconds: 1800, label: '30 分' },
  { seconds: 3600, label: '1 時' },
] as const

const playingId = ref<number | 'final' | null>(null)
let playingTimer: number | null = null

const draggingId = ref<number | null>(null)
const dropTargetId = ref<number | null>(null)

function onCardDragStart(e: DragEvent, id: number) {
  draggingId.value = id
  if (e.dataTransfer) {
    e.dataTransfer.setData('warning-id', String(id))
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onCardDragOver(e: DragEvent, id: number) {
  if (draggingId.value === null || draggingId.value === id) {
    dropTargetId.value = null
    return
  }
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropTargetId.value = id
}

function onCardDragLeave(id: number) {
  if (dropTargetId.value === id) dropTargetId.value = null
}

function onCardDrop(_e: DragEvent, targetId: number) {
  const srcId = draggingId.value
  if (srcId === null || srcId === targetId) {
    cleanup()
    return
  }
  const arr = [...props.warnings]
  const srcIdx = arr.findIndex(w => w.id === srcId)
  const dstIdx = arr.findIndex(w => w.id === targetId)
  if (srcIdx === -1 || dstIdx === -1) {
    cleanup()
    return
  }
  const [moved] = arr.splice(srcIdx, 1)
  arr.splice(dstIdx, 0, moved)
  emit('update:warnings', arr)
  cleanup()
}

function onCardDragEnd() {
  cleanup()
}

function cleanup() {
  draggingId.value = null
  dropTargetId.value = null
}

function isActive(presetSeconds: number) {
  return props.duration === presetSeconds
}

function selectPreset(presetSeconds: number) {
  emit('update:duration', presetSeconds)
}

function updateWarning(updated: Warning) {
  emit('update:warnings', props.warnings.map((w) => (w.id === updated.id ? updated : w)))
}

function deleteWarning(id: number) {
  emit('update:warnings', props.warnings.filter((w) => w.id !== id))
}

function addWarning() {
  const nextId = props.warnings.length > 0 ? Math.max(...props.warnings.map((w) => w.id)) + 1 : 1
  emit('update:warnings', [
    ...props.warnings,
    { id: nextId, at: 5, color: 'red', sound: 'gong' },
  ])
}

function updateFinal(e: Event) {
  emit('update:finalSound', (e.target as HTMLSelectElement).value as SoundKey)
}

function onWarningPreview(warning: Warning) {
  playingId.value = warning.id
  props.playSound(warning.sound)
  if (playingTimer != null) clearTimeout(playingTimer)
  playingTimer = window.setTimeout(() => {
    playingId.value = null
    playingTimer = null
  }, 1200)
}

function onFinalPreview() {
  playingId.value = 'final'
  props.playSound(props.finalSound)
  if (playingTimer != null) clearTimeout(playingTimer)
  playingTimer = window.setTimeout(() => {
    playingId.value = null
    playingTimer = null
  }, 1200)
}
</script>

<template>
  <aside
    class="fixed top-5 right-5 bottom-5 w-[min(440px,92vw)] bg-white text-ink rounded-[28px] py-8 px-7 overflow-y-auto z-10 shadow-panel transition-transform duration-300 ease-out"
    :style="open ? 'transform: translateX(0)' : 'transform: translateX(calc(100% + 1.5rem))'"
  >
    <div class="flex items-center justify-between mb-7">
      <h2 class="text-2xl font-extrabold">計時器設定</h2>
      <button
        @click="emit('close')"
        class="w-10 h-10 rounded-full bg-bg border-0 text-xl cursor-pointer text-ink flex items-center justify-center hover:bg-orange-soft transition-colors"
        aria-label="關閉"
      >
        ×
      </button>
    </div>

    <SectionTag>基本</SectionTag>
    <div class="mt-3 mb-4">
      <label class="block text-sm mb-2 font-semibold text-muted">倒數時間</label>
      <DurationHmsInput :model-value="duration" @update:model-value="$emit('update:duration', $event)" />
      <div class="preset-chips">
        <button
          v-for="preset in PRESETS"
          :key="preset.seconds"
          class="chip"
          :class="{ active: isActive(preset.seconds) }"
          type="button"
          @click="selectPreset(preset.seconds)"
        >
          {{ preset.label }}
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between px-[1.1rem] py-[0.85rem] bg-bg rounded-[20px] mb-2.5">
      <div>
        <div class="font-semibold">時間到後循環</div>
        <div class="text-[0.8rem] text-muted mt-0.5">適合番茄鐘、間歇任務</div>
      </div>
      <ToggleSwitch :model-value="repeat" @update:model-value="(v) => emit('update:repeat', v)" />
    </div>

    <div class="mt-6 mb-3">
      <SectionTag>警告里程碑</SectionTag>
    </div>
    <WarningCard
      v-for="w in warnings"
      :key="w.id"
      :warning="w"
      :is-playing="playingId === w.id"
      :is-dragging="draggingId === w.id"
      :is-drop-target="dropTargetId === w.id"
      @update:warning="updateWarning"
      @delete="deleteWarning"
      @preview="onWarningPreview"
      @dragstart="onCardDragStart"
      @dragover="onCardDragOver"
      @dragleave="onCardDragLeave"
      @drop="onCardDrop"
      @dragend="onCardDragEnd"
    />
    <button
      @click="addWarning"
      class="w-full py-[0.95rem] border-2 border-dashed border-[#D9CFC4] bg-transparent rounded-[20px] cursor-pointer font-bold text-muted text-[0.95rem] hover:border-orange hover:text-orange hover:bg-orange-soft transition-colors"
    >
      + 新增警告
    </button>

    <div class="mt-6 mb-3">
      <SectionTag>結束音效</SectionTag>
    </div>
    <div class="flex gap-2 items-center mb-4">
      <select
        :value="finalSound"
        @change="updateFinal"
        class="warn-select flex-1 min-w-0 px-[1.1rem] py-[0.85rem] text-base"
      >
        <option v-for="k in soundKeys" :key="k" :value="k">{{ SOUND_LABELS[k] }}</option>
      </select>
      <button
        type="button"
        class="preview-btn shrink-0"
        :class="{ playing: playingId === 'final' }"
        @click="onFinalPreview"
        aria-label="試聽結束音效"
      >
        <svg v-if="playingId !== 'final'" viewBox="0 0 12 12">
          <path d="M3 1 L10 6 L3 11 Z" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 12 12">
          <rect x="3" y="3" width="2" height="6" fill="currentColor" />
          <rect x="7" y="3" width="2" height="6" fill="currentColor" />
        </svg>
      </button>
    </div>

    <button
      @click="emit('close')"
      class="cta-done w-full mt-6 border-0 rounded-[20px] text-base cursor-pointer active:scale-[0.97] transition-transform"
    >
      ✓ 設定完成
    </button>
  </aside>
</template>

<style scoped>
.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.75rem;
}

.chip {
  border: 0;
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.4rem 0.75rem;
  border-radius: 9999px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.chip:hover {
  background: var(--color-orange-soft);
}

.chip.active {
  background: var(--color-orange);
  color: #fff;
}

.cta-done {
  padding: 0.85rem;
  background: var(--color-orange-soft);
  color: var(--color-orange);
  font-weight: 700;
  box-shadow: none;
  min-height: 44px;
}

.cta-done:hover {
  background: #FFD4BC;
}
</style>
