<script setup lang="ts">
/**
 * Host-only share trigger. Bottom-left, diagonal from the right-bottom
 * main controls. Always visible (NOT hover-reveal — sharing is a task
 * users go looking for; hover-reveal would hide it from them).
 *
 * Per `mockups/room-sync/share-button.html`:
 *   - 44px height, pill, 18×18 link icon + label "複製連結"
 *   - bg `rgb(28 20 16 / 0.08)`, hover `/0.16` + translateY(-1px)
 *   - position fixed bottom-7 left-7, z-index 20
 *
 * Conditional rendering lives on the parent (`v-if="isHost"`); this
 * component itself doesn't know about host/viewer mode.
 */
defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="share-btn fixed bottom-7 left-7 z-20 inline-flex items-center justify-center h-11 rounded-full border-0 cursor-pointer font-bold text-[0.95rem] gap-[0.45rem] pl-[0.85rem] pr-4"
    aria-label="複製分享連結"
    title="複製分享連結"
    @click="$emit('click')"
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
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.5-1.5" />
    </svg>
    <span>複製連結</span>
  </button>
</template>

<style scoped>
.share-btn {
  /* Match the existing .fs-btn ghost token style: subtle dark wash that
   * survives both the cream idle bg and the warning-state colored bgs. */
  background: rgb(28 20 16 / 0.08);
  color: var(--color-ink);
  transition: background-color 0.15s ease, transform 0.15s ease;
}

@media (hover: hover) {
  .share-btn:hover {
    background: rgb(28 20 16 / 0.16);
    transform: translateY(-1px);
  }
}

/* Inverse-contrast version for the `state-done` orange background — same
 * mechanic as .fs-btn so the two corner buttons stay visually paired. */
:global(.state-done) .share-btn {
  background: rgb(255 255 255 / 0.22);
  color: #fff;
}
@media (hover: hover) {
  :global(.state-done) .share-btn:hover {
    background: rgb(255 255 255 / 0.34);
  }
}
</style>
