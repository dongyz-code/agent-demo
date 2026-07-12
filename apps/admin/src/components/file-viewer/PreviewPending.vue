<template>
  <div class="flex min-h-60 flex-col items-center justify-center gap-3 text-gray-500">
    <span class="animate-pulse text-2xl">•••</span>
    <span>{{ stopped ? '预览仍在处理中，请稍后手动刷新' : reason || '预览正在生成，请稍候' }}</span>
    <el-button v-if="stopped" type="primary" link @click="$emit('refresh')">重新检查</el-button>
  </div>
</template>
<script setup lang="ts">
import { ElButton } from 'element-plus';

defineProps<{
  /** 服务端返回的处理说明。 */
  reason?: string | null;
  /** 是否已达到自动轮询上限。 */
  stopped?: boolean;
}>();

defineEmits<{
  /** 用户主动要求重新检查预览。 */
  refresh: [];
}>();
</script>
