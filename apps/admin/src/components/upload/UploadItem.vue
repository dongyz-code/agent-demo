<template>
  <div class="rounded border border-gray-200 p-3">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium">{{ item.name }}</div>
        <el-progress
          v-if="showProgress"
          :percentage="item.progress"
          :status="progressStatus"
        />
        <div v-if="!item.error" class="mt-1 text-xs text-gray-400">
          {{ stageText }}<span v-if="item.restored"> · 已恢复</span>
        </div>
        <div v-if="item.error" class="mt-1 text-xs text-red-500">{{ item.error }}</div>
      </div>
      <div class="flex shrink-0 gap-1">
        <el-button v-if="canPauseResume" link @click="$emit('pause-resume')">
          {{ pauseResumeText }}
        </el-button>
        <el-button
          v-if="item.error && item.retryable"
          link
          type="primary"
          @click="$emit('retry')"
        >
          重试
        </el-button>
        <el-button link type="danger" @click="$emit('remove')">移除</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElButton, ElProgress } from 'element-plus';

import type { UploadQueueItem, UploadQueueStage } from './types';

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
  if (props.item.stage === 'complete') return 'success';
  return undefined;
});
const showProgress = computed(() =>
  ['uploading', 'paused', 'confirming', 'complete', 'failed'].includes(
    props.item.stage,
  ),
);
const canPauseResume = computed(() =>
  ['uploading', 'paused'].includes(props.item.stage),
);
const pauseResumeText = computed(() => {
  if (props.item.stage === 'paused') return '继续';
  return '暂停';
});
const stageText = computed(() => stageLabels[props.item.stage]);

/** 上传阶段对应的简洁中文说明。 */
const stageLabels: Record<UploadQueueStage, string> = {
  waiting: '等待上传',
  initializing: '正在初始化上传会话',
  uploading: '正在传输文件',
  paused: '已暂停',
  confirming: '文件已传输，正在验证并创建文档版本',
  complete: '文档已入库',
  failed: '上传失败',
};
</script>
