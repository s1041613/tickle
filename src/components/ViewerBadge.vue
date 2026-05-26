<script setup lang="ts">
/**
 * Top-left identity pill for viewer mode. Black pill + pulsing green
 * dot that signals "you're connected, just not in control".
 *
 * Per `mockups/room-sync/kicked-and-disabled-state.html` Case B:
 *   - top-4 left-4
 *   - black bg, white text, "VIEWER · 唯讀" with letter-spacing 0.06em
 *   - 7×7 green dot with pulse box-shadow animation 1.6s
 *   - z-index 5 (above timer, below modal layers)
 *
 * Parent renders this with `v-if="isViewer"`. We don't render anything
 * on host or kicked (kicked uses the top ribbon instead).
 */
</script>

<template>
  <div
    class="viewer-badge fixed top-4 left-4 z-10 inline-flex items-center gap-[0.35rem] pl-[0.55rem] pr-[0.7rem] py-[0.35rem] rounded-full bg-ink text-white text-[0.72rem] font-extrabold"
    style="letter-spacing: 0.06em;"
    role="status"
    aria-label="目前為唯讀觀眾模式"
  >
    <span class="pulse-dot" aria-hidden="true"></span>
    <span>VIEWER · 唯讀</span>
  </div>
</template>

<style scoped>
.pulse-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4CAF74;
  box-shadow: 0 0 0 0 rgba(76, 175, 116, 0.5);
  animation: pulseDot 1.6s ease-out infinite;
}

@keyframes pulseDot {
  0%   { box-shadow: 0 0 0 0 rgba(76, 175, 116, 0.5); }
  70%  { box-shadow: 0 0 0 8px rgba(76, 175, 116, 0); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 116, 0); }
}
</style>
