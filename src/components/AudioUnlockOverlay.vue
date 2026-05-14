<script setup lang="ts">
defineEmits<{ unlock: [] }>()
</script>

<template>
  <div
    @click="$emit('unlock')"
    class="fixed inset-0 bg-orange text-white flex flex-col items-center justify-center gap-6 z-[100] cursor-pointer text-center p-8"
  >
    <div
      class="w-[120px] h-[120px] bg-white rounded-full flex items-center justify-center text-[4rem] shadow-[0_20px_40px_rgb(0_0_0_/_0.15)]"
      style="animation: tap 1.5s infinite;"
    >
      👆
    </div>
    <div class="text-[2.5rem] font-black">點一下螢幕</div>
    <div class="text-[1.05rem] opacity-90 max-w-[360px] leading-[1.7] text-balance-cjk">
      iPad Safari 規定<br>必須先點擊一次才能播放警示音
    </div>
  </div>
</template>
