<template>
  <div class="relative flex items-center justify-center">
    <div
      class="absolute top-1/2 h-0.5 w-full -translate-y-1/2 rounded bg-gray-100"
    ></div>
    <div class="z-10 bg-white px-4 opacity-75">{{ title }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
}>();
</script>
