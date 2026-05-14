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
  testFinal: []
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
      <div class="text-xs text-muted mt-1.5">
        💡 設定 30 秒可快速測試，警告里程碑會在剩 20 / 10 秒觸發
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
      @update:warning="updateWarning"
      @delete="deleteWarning"
      @preview="onWarningPreview"
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
        class="flex-1 px-[1.1rem] py-[0.85rem] border-2 border-transparent bg-bg rounded-[20px] text-base font-semibold text-ink focus:outline-none focus:border-orange focus:bg-white"
      >
        <option v-for="k in soundKeys" :key="k" :value="k">{{ SOUND_LABELS[k] }}</option>
      </select>
      <button
        @click="emit('testFinal')"
        class="bg-transparent border-0 text-orange cursor-pointer font-semibold text-sm px-2 py-2 hover:underline"
      >
        ▶ 試聽
      </button>
    </div>

    <button
      @click="emit('close')"
      class="w-full mt-6 py-[1.1rem] border-0 rounded-[20px] text-base font-extrabold cursor-pointer bg-orange text-white shadow-orange active:scale-[0.97] transition-transform"
    >
      ✓ 設定完成
    </button>

    <div class="mt-4 px-[1.1rem] py-4 bg-[#FFF8E8] rounded-[20px] text-[0.82rem] leading-[1.5] border-l-4 border-yellow text-balance-cjk">
      💡 設定會自動寫進網址列<br>複製當前 URL，貼到 iPad Safari 就能用，完全一致
    </div>
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
</style>
