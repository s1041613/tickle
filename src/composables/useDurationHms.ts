import { computed, type Ref } from 'vue'

function clamp(x: number): number {
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0
}

export function useDurationHms(seconds: Ref<number>) {
  const h = computed(() => Math.floor(seconds.value / 3600))
  const m = computed(() => Math.floor((seconds.value % 3600) / 60))
  const s = computed(() => Math.floor(seconds.value % 60))

  function setHms(next: { h: number; m: number; s: number }) {
    seconds.value = clamp(next.h) * 3600 + clamp(next.m) * 60 + clamp(next.s)
  }

  return { h, m, s, setHms }
}
