import { computed, type Ref } from 'vue'

export function useDurationHms(seconds: Ref<number>) {
  const h = computed(() => Math.floor(seconds.value / 3600))
  const m = computed(() => Math.floor((seconds.value % 3600) / 60))
  const s = computed(() => seconds.value % 60)

  function setHms(next: { h: number; m: number; s: number }) {
    const hValid = Number.isFinite(next.h) && next.h >= 0
    const mValid = Number.isFinite(next.m) && next.m >= 0
    const sValid = Number.isFinite(next.s) && next.s >= 0

    if (!hValid || !mValid || !sValid) {
      seconds.value = 0
      return
    }

    seconds.value = next.h * 3600 + next.m * 60 + next.s
  }

  return { h, m, s, setHms }
}
