<template>
  <div class="rounded border border-gray-200 p-3">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium">{{ item.name }}</div>
        <el-progress :percentage="item.progress" :status="progressStatus" />
        <div v-if="item.error" class="mt-1 text-xs text-red-500">{{ item.error }}</div>
      </div>
      <div class="flex shrink-0 gap-1">
        <el-button v-if="!item.complete && !item.error" link @click="$emit('pause-resume')">
          {{ item.paused ? '继续' : '暂停' }}
        </el-button>
        <el-button v-if="item.error" link type="primary" @click="$emit('retry')">重试</el-button>
        <el-button link type="danger" @click="$emit('remove')">取消</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElButton, ElProgress } from 'element-plus';

import type { UploadQueueItem } from './types';

const props = defineProps<{
  /** 当前上传队列项。 */
  item: UploadQueueItem;
}>();

defineEmits<{
  /** 切换暂停或继续。 */
  'pause-resume': [];
  /** 移除并取消上传。 */
  remove: [];
  /** 重试失败上传。 */
  retry: [];
}>();

const progressStatus = computed(() => {
  if (props.item.error) return 'exception';
  if (props.item.complete) return 'success';
  return undefined;
});
</script>
