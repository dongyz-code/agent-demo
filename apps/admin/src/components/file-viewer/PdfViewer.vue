<template><iframe class="h-[70vh] w-full border-0" :src="url" title="PDF 预览" /></template>
<script setup lang="ts">
defineProps<{ /** 短期 PDF 预览地址。 */ url: string }>();
</script>
