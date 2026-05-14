<script setup lang="ts">
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

function toggle() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    :aria-pressed="modelValue"
    @click="toggle"
    class="relative w-[50px] h-[30px] rounded-full transition-colors duration-200 flex-shrink-0"
    :class="modelValue ? 'bg-orange' : 'bg-[#ddd]'"
  >
    <span
      class="absolute top-[3px] left-[3px] w-6 h-6 bg-white rounded-full shadow transition-transform duration-200"
      :style="modelValue ? 'transform: translateX(20px)' : ''"
    ></span>
  </button>
</template>
