<template><img class="mx-auto max-h-[70vh] max-w-full object-contain" :src="url" alt="图片预览" /></template>
<script setup lang="ts">
defineProps<{ /** 短期图片预览地址。 */ url: string }>();
</script>
