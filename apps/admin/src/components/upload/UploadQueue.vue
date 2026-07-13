<template>
  <div class="space-y-2">
    <upload-item
      v-for="item in items"
      :key="item.id"
      :item="item"
      @pause-resume="$emit('pause-resume', item.id)"
      @remove="$emit('remove', item.id)"
      @retry="$emit('retry', item.id)"
    />
    <el-empty v-if="!items.length" description="请选择需要上传的文件" />
  </div>
</template>

<script setup lang="ts">
import { ElEmpty } from 'element-plus';
import UploadItem from './UploadItem.vue';

import type { UploadQueueItem } from './types';

defineProps<{
  /** 当前上传队列。 */
  items: UploadQueueItem[];
}>();

defineEmits<{
  /** 切换指定文件暂停状态。 */
  'pause-resume': [fileId: string];
  /** 移除指定文件。 */
  remove: [fileId: string];
  /** 重试指定文件。 */
  retry: [fileId: string];
}>();
</script>
