<script setup lang="ts">
/**
 * Top-edge ribbon shown when this tab was the host but got replaced
 * by a newer tab. Per UX spec: yellow ribbon, NOT modal — the timer
 * stays normal so the user can still see what was being broadcast.
 *
 * Per `mockups/room-sync/kicked-and-disabled-state.html` Case A:
 *   - bg #FFF4D6, 2px bottom border --color-yellow
 *   - 36×36 yellow square icon, alert triangle stroke
 *   - "此分頁已被新分頁取代" + 解釋（不用「衝突 / 被踢出」字眼）
 *   - "回首頁開新 room" CTA (black pill, min 44px) — emits 'goHome'
 *   - X close button (circular 36×36 hit area, 18×18 stroke icon) — emits 'dismiss'
 *   - role="status" aria-live="polite" (NOT alert — don't hard-break screen readers)
 *
 * Dismissal is one-way (session-only, not persisted). Parent owns the
 * visibility flag and re-renders this when both `kicked && !dismissed`.
 */
defineEmits<{
  goHome: []
  dismiss: []
}>()
</script>

<template>
  <div
    class="kicked-ribbon fixed top-0 left-0 right-0 z-30 px-5 py-[0.95rem] flex items-center gap-[0.85rem]"
    role="status"
    aria-live="polite"
  >
    <div class="kicked-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
    </div>
    <div class="kicked-text flex-1 min-w-0 text-[0.92rem] leading-[1.45]">
      <strong class="block font-extrabold text-[0.95rem] mb-[0.15rem]">
        此分頁已被新分頁取代
      </strong>
      <span class="text-muted text-[0.8rem]">
        你在另一個分頁打開了同一個 room；這裡已切換為唯讀模式，無法再控制計時器。
      </span>
    </div>
    <div class="kicked-actions flex-shrink-0 flex items-center gap-2">
      <button
        type="button"
        class="kicked-cta bg-ink text-white border-0 font-bold text-[0.85rem] px-4 py-[0.65rem] rounded-full cursor-pointer min-h-[44px] whitespace-nowrap"
        @click="$emit('goHome')"
      >
        回首頁開新 room
      </button>
      <button
        type="button"
        class="kicked-close flex-shrink-0 w-9 h-9 min-w-[36px] border-0 bg-transparent rounded-full text-ink cursor-pointer inline-flex items-center justify-center transition-colors"
        aria-label="關閉提示"
        title="關閉提示"
        @click="$emit('dismiss')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-[18px] h-[18px]"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.kicked-ribbon {
  background: #FFF4D6;
  border-bottom: 2px solid var(--color-yellow);
  box-shadow: 0 6px 16px rgb(28 20 16 / 0.06);
  color: var(--color-ink);
}

.kicked-icon {
  width: 36px;
  height: 36px;
  background: var(--color-yellow);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-ink);
  flex-shrink: 0;
}
.kicked-icon svg {
  width: 20px;
  height: 20px;
}

@media (hover: hover) {
  .kicked-cta:hover {
    background: #2B201A;
  }
  .kicked-close:hover {
    background: rgb(28 20 16 / 0.08);
  }
}

.kicked-close:focus-visible {
  outline: 2px solid var(--color-ink);
  outline-offset: 2px;
}
</style>
