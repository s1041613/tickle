<script setup lang="ts">
/**
 * Modal showing the viewer URL with copy + QR-placeholder.
 *
 * Per `mockups/room-sync/share-dialog.html`:
 *   - center modal, min(440px, 92vw), rounded-[28px]
 *   - backdrop rgb(28 20 16 / 0.35) + blur(2px), pop-in animation
 *   - close: × button / backdrop click / ESC
 *   - URL input readonly, click-to-select, SF Mono font
 *   - copy button: orange CTA → green "已複製" for 1.5s + toast
 *   - QR area: 96×96 dashed placeholder (real lib in future)
 *
 * This component does NOT do the actual clipboard write — it emits
 * `copy` and lets the parent (which has access to `useShareLink` in
 * Task FE-8) handle the side effect + report back via `:copied`.
 *
 * Why the split: keeps the dialog dumb (testable, host-independent),
 * lets the parent decide what "copy" means (clipboard? share sheet?
 * share via system intent on mobile?).
 */
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  viewerUrl: string
  /** Parent flips this to true after a successful copy; component shows
   *  the "已複製" affordance for 1.5s and then resets via internal timer. */
  copied?: boolean
}>()

const emit = defineEmits<{
  close: []
  copy: []
}>()

const urlInputRef = ref<HTMLInputElement | null>(null)
const showToast = ref(false)
let toastTimer: number | null = null

// Focus the URL input + select its contents when the dialog opens — the
// most common next action is "select + Cmd+C as a fallback to the button".
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    urlInputRef.value?.focus()
    urlInputRef.value?.select()
  },
)

// Reflect the parent's `copied` flag with a 1.5s toast. Using a local
// timer here keeps the parent stateless beyond the single bool.
watch(
  () => props.copied,
  (v) => {
    if (!v) return
    showToast.value = true
    if (toastTimer != null) clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      showToast.value = false
      toastTimer = null
    }, 1500)
  },
)

function onBackdropClick(e: MouseEvent) {
  // Don't dismiss when the click started inside the dialog and bubbled
  // here — match the standard modal pattern.
  if (e.target === e.currentTarget) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function onUrlClick() {
  urlInputRef.value?.select()
}

function onCopyClick() {
  emit('copy')
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="backdrop fixed inset-0 z-30"
        aria-hidden="true"
        @click="onBackdropClick"
        @keydown="onKeydown"
      >
        <div
          class="dialog fixed top-1/2 left-1/2 w-[min(440px,92vw)] bg-white rounded-[28px] px-7 py-8 shadow-panel z-40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-dialog-title"
          @click.stop
          @keydown.stop="onKeydown"
        >
          <!-- Toast: confirmation badge that hovers above the dialog -->
          <Transition
            enter-active-class="transition-all duration-200"
            leave-active-class="transition-all duration-200"
            enter-from-class="opacity-0 translate-y-1"
            leave-to-class="opacity-0 translate-y-1"
          >
            <div
              v-if="showToast"
              class="toast absolute -top-11 right-0 bg-ink text-white px-[0.85rem] py-2 rounded-full text-[0.8rem] font-semibold whitespace-nowrap pointer-events-none"
              role="status"
              aria-live="polite"
            >
              ✓ 已複製到剪貼簿
            </div>
          </Transition>

          <div class="flex items-center justify-between mb-5">
            <h2 id="share-dialog-title" class="text-[1.5rem] font-extrabold">
              分享給觀眾
            </h2>
            <button
              type="button"
              class="w-10 h-10 rounded-full bg-bg border-0 text-[1.25rem] cursor-pointer text-ink flex items-center justify-center hover:bg-orange-soft transition-colors"
              aria-label="關閉"
              @click="emit('close')"
            >
              ×
            </button>
          </div>

          <span class="section-tag inline-flex items-center gap-[0.4rem] text-[0.95rem] font-bold text-ink mb-[0.6rem]">
            <span class="section-tag-mark" aria-hidden="true"></span>
            觀眾連結
          </span>
          <p class="text-[0.85rem] text-muted leading-[1.55] mb-[0.85rem]">
            複製這個 URL 給觀眾。他們只能「看」、不能控制計時器。
          </p>

          <div class="flex items-stretch gap-2 mb-6">
            <input
              ref="urlInputRef"
              type="text"
              class="url-input flex-1 min-w-0 px-[1.1rem] py-[0.95rem] rounded-[20px] text-[0.95rem] font-semibold text-ink truncate"
              :value="viewerUrl"
              readonly
              aria-label="觀眾連結"
              @click="onUrlClick"
            />
            <button
              type="button"
              class="copy-btn inline-flex items-center justify-center gap-[0.4rem] px-5 rounded-[20px] border-0 text-[0.95rem] font-bold text-white cursor-pointer transition-all"
              :class="{ 'is-copied': copied }"
              :aria-label="copied ? '已複製到剪貼簿' : '複製到剪貼簿'"
              @click="onCopyClick"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.3"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="w-4 h-4"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>{{ copied ? '已複製' : '複製' }}</span>
            </button>
          </div>

          <span class="section-tag inline-flex items-center gap-[0.4rem] text-[0.95rem] font-bold text-ink mb-[0.6rem]">
            <span class="section-tag-mark" aria-hidden="true"></span>
            QR Code（觀眾掃描）
          </span>
          <div class="qr-area bg-bg rounded-[20px] p-5 flex items-center gap-[1.1rem]">
            <div
              class="qr-slot w-24 h-24 bg-white rounded-[14px] flex-shrink-0 flex items-center justify-center text-muted text-[0.7rem] font-semibold text-center leading-[1.35]"
            >
              QR<br />(預留)
            </div>
            <div>
              <div class="text-[0.95rem] font-bold mb-1">手機掃即可加入</div>
              <div class="text-[0.78rem] text-muted leading-[1.5]">
                適合課堂、活動現場讓觀眾用手機跟著看倒數。
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  background: rgb(28 20 16 / 0.35);
  /* iPad Safari supports both, but the `-webkit-` form needs to come
   * first or some older versions silently drop the unprefixed one. */
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.dialog {
  transform: translate(-50%, -50%);
  /* Pop-in matches the mockup's playful easing. We don't use Vue's
   * <Transition> for this one because the backdrop fade and the
   * dialog scale need separate easings. */
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-pop {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.section-tag-mark {
  display: inline-block;
  width: 10px;
  height: 16px;
  background: var(--color-yellow);
  border-radius: 2px;
  /* Same skew as SettingsPanel's SectionTag for visual continuity. */
  transform: skewX(-10deg);
}

.url-input {
  background: var(--color-bg);
  border: 2px solid transparent;
  font-family: "SF Mono", ui-monospace, Menlo, monospace;
}
.url-input:focus {
  outline: none;
  border-color: var(--color-orange);
  background: #fff;
}

.copy-btn {
  background: var(--color-orange);
  min-width: 96px;
  box-shadow: 0 6px 18px rgb(255 107 61 / 0.3);
  min-height: 44px;
}
@media (hover: hover) {
  .copy-btn:hover {
    transform: translateY(-1px);
  }
}
.copy-btn:active {
  transform: translateY(0);
}
.copy-btn.is-copied {
  background: #4CAF74;
  box-shadow: 0 6px 18px rgb(76 175 116 / 0.3);
}
</style>
