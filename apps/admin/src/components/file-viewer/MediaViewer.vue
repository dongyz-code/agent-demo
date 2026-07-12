<template>
  <video v-if="contentType.startsWith('video/')" class="max-h-[70vh] w-full" :src="url" controls />
  <audio v-else class="w-full" :src="url" controls />
</template>
<script setup lang="ts">
defineProps<{
  /** 短期媒体预览地址，底层对象存储需支持 Range。 */
  url: string;
  /** 服务端验证后的可信媒体 MIME。 */
  contentType: string;
}>();
</script>
