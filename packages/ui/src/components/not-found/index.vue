<template>
  <div class="flex min-h-screen items-center justify-center select-none">
    <img :src="Img404" class="w-125" />
    <div>
      <div class="text-6xl">404</div>
      <div
        class="hover:text-primary mt-4 cursor-pointer text-center font-bold underline underline-offset-4"
        @click="backToHome?.()"
      >
        返回首页
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Img404 from './404.svg';

defineProps<{
  backToHome?: () => void;
}>();
</script>
