<template><div class="prose max-w-none overflow-auto" v-html="html" /></template>
<script setup lang="ts">
defineProps<{ /** 服务端已转义或清洗的安全 HTML。 */ html: string }>();
</script>
