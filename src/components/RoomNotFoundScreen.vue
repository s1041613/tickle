<script setup lang="ts">
/**
 * Full-screen guide shown when a viewer's URL points to a room the
 * server doesn't know about (expired, GC'd, typoed). Auto-recovers by
 * stripping the URL params and navigating home — so the next visit
 * goes through the normal `create` flow.
 *
 * Per `mockups/room-sync/room-not-found.html`:
 *   - cream bg (#FAF7F2) — language of "wait a moment", not "error"
 *   - 140×140 white disc + orange spinner ring (1.4s linear)
 *   - countdown card with yellow left-stripe, 3s default
 *   - manual fallback underline button
 *   - role="alert" aria-live="polite", responsive shrink to 110px on phones
 *
 * The component owns the countdown timer + the eventual navigation;
 * the parent just renders it whenever `room-not-found` state hits.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Seconds before auto-redirect. Default 3, matches mockup. */
    countdownSeconds?: number
  }>(),
  { countdownSeconds: 3 },
)

const remaining = ref(props.countdownSeconds)
let intervalId: number | null = null

function goHomeNow() {
  // Strip the entire query string so we don't loop on the same broken
  // room id. Path-only nav lets index.html boot and the App.vue
  // resolveMode() pick the `create` branch.
  window.location.href = window.location.pathname
}

onMounted(() => {
  intervalId = window.setInterval(() => {
    remaining.value -= 1
    if (remaining.value <= 0) {
      if (intervalId != null) {
        clearInterval(intervalId)
        intervalId = null
      }
      goHomeNow()
    }
  }, 1000)
})

onBeforeUnmount(() => {
  if (intervalId != null) {
    clearInterval(intervalId)
    intervalId = null
  }
})
</script>

<template>
  <div
    class="stage fixed inset-0 z-40 flex flex-col items-center justify-center text-center p-8"
    role="alert"
    aria-live="polite"
  >
    <!-- White disc + orange spinner ring -->
    <div class="icon-disc relative">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
        <path d="m8 8 6 6" />
        <path d="m14 8-6 6" />
      </svg>
    </div>

    <h1 class="title text-[2.25rem] font-extrabold tracking-tight leading-[1.2] mb-[0.85rem]">
      Room 不存在或已過期
    </h1>
    <p class="subtitle text-[1.05rem] text-muted leading-[1.65] max-w-[460px] mb-9">
      你打開的連結指到的房間找不到了。<br />
      別擔心 — 我們正在幫你建立一個新的 room。
    </p>

    <div class="countdown-card" aria-label="自動建立新 room 倒數">
      <div class="countdown-num" :key="remaining">{{ Math.max(0, remaining) }}</div>
      <div class="countdown-text">
        秒後自動進入新 room
        <span class="sub">URL 會自動更新為新的 room ID</span>
      </div>
    </div>

    <button
      type="button"
      class="manual-btn"
      @click="goHomeNow"
    >
      現在就建立新 room →
    </button>
  </div>
</template>

<style scoped>
.stage {
  background: #FAF7F2;
  color: var(--color-ink);
}

.icon-disc {
  width: 140px;
  height: 140px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgb(28 20 16 / 0.06);
  margin-bottom: 2rem;
}
.icon-disc svg {
  width: 64px;
  height: 64px;
  color: var(--color-muted);
}
/* Spinning ring around the disc — signals "we are working on it". */
.icon-disc::after {
  content: "";
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: var(--color-orange);
  border-right-color: var(--color-orange);
  animation: spin 1.4s linear infinite;
  opacity: 0.85;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.countdown-card {
  background: #fff;
  border-radius: 20px;
  padding: 1rem 1.5rem 1rem 1.25rem;
  box-shadow: 0 8px 32px rgb(28 20 16 / 0.06);
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  border-left: 4px solid var(--color-yellow);
}
.countdown-num {
  font-family: var(--font-display);
  font-size: 2.5rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: var(--color-orange);
  line-height: 1;
  min-width: 1.6ch;
  text-align: center;
  /* tick animation each second — keyed on remaining so Vue restarts it */
  animation: tick 1s ease-out infinite;
}
@keyframes tick {
  0%   { transform: scale(1.08); opacity: 0.6; }
  20%  { transform: scale(1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.countdown-text {
  text-align: left;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-ink);
  line-height: 1.45;
}
.countdown-text .sub {
  display: block;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-muted);
  margin-top: 0.15rem;
}

.manual-btn {
  margin-top: 1.75rem;
  background: transparent;
  border: 0;
  color: var(--color-muted);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.6rem 1rem;
  border-radius: 9999px;
  text-decoration: underline;
  text-underline-offset: 3px;
  min-height: 44px;
}
@media (hover: hover) {
  .manual-btn:hover {
    color: var(--color-orange);
  }
}

@media (max-width: 480px) {
  .title { font-size: 1.75rem; }
  .subtitle { font-size: 0.95rem; }
  .icon-disc { width: 110px; height: 110px; margin-bottom: 1.5rem; }
  .icon-disc svg { width: 52px; height: 52px; }
}
</style>
