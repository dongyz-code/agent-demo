<template>
  <el-drawer v-model="visible" title="文件处理任务" size="680px">
    <template v-if="detail">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="文件">{{ detail.filename }}</el-descriptions-item>
        <el-descriptions-item label="执行次数">第 {{ detail.executionNo }} 次</el-descriptions-item>
        <el-descriptions-item label="知识库">{{ detail.datasetName ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ taskStatusLabels[detail.status] }}</el-descriptions-item>
        <el-descriptions-item label="当前阶段">{{ stageLabels[detail.stage] }}</el-descriptions-item>
        <el-descriptions-item label="进度">{{ detail.progress }}%</el-descriptions-item>
        <el-descriptions-item v-if="detail.errorMessage" label="失败原因" :span="2">
          {{ detail.errorMessage }}
        </el-descriptions-item>
      </el-descriptions>

      <div class="mt-5 font-medium">执行阶段</div>
      <el-table class="mt-2" :data="detail.stageRuns" border>
        <el-table-column label="阶段" min-width="140">
          <template #default="{ row }">{{ getStageLabel(row.stage) }}</template>
        </el-table-column>
        <el-table-column prop="attempt" label="尝试" width="70" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ getTaskStatusLabel(row.status) }}</template>
        </el-table-column>
        <el-table-column prop="processedItems" label="处理数量" width="100" />
        <el-table-column label="开始时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column prop="errorMessage" label="错误" min-width="180" />
      </el-table>

      <div v-if="detail.resultSummary" class="mt-5">
        <div class="font-medium">结果摘要</div>
        <pre class="mt-2 rounded bg-gray-50 p-3 text-sm">{{ JSON.stringify(detail.resultSummary, null, 2) }}</pre>
      </div>
    </template>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button
        v-if="canCancel && detail && ['to-be-started', 'pending'].includes(detail.status)"
        type="danger"
        @click="cancel"
      >
        取消任务
      </el-button>
      <el-button
        v-if="canRetry && detail?.retryable"
        type="primary"
        @click="retry"
      >
        {{ detail.status === 'failed' ? '重试' : '再次执行' }}
      </el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import {
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElDrawer,
  ElTable,
  ElTableColumn,
} from 'element-plus';

import { api, confirm, notify } from '@/utils';
import { useStore } from '@/models';
import { adminPermissionKey } from '@repo/shared/permission';

import type {
  FileProcessingStage,
  FileProcessingTaskDetail,
  FileProcessingTaskStatus,
} from '@/types';

const emit = defineEmits<{
  /** 任务状态或历史发生变化。 */
  changed: [];
}>();

const visible = ref(false);
const detail = shallowRef<FileProcessingTaskDetail>();
const store = useStore();
const canCancel = computed(() =>
  store.hasPermission(adminPermissionKey('actions.task.kill')),
);
const canRetry = computed(() =>
  store.hasPermission(adminPermissionKey('actions.task.retry')),
);

const taskStatusLabels: Record<FileProcessingTaskStatus, string> = {
  'to-be-started': '等待执行',
  pending: '执行中',
  completed: '接入成功',
  failed: '执行失败',
  killed: '已取消',
};

const stageLabels: Record<FileProcessingStage, string> = {
  queued: '等待执行',
  reading: '读取内容',
  parsing: '解析内容',
  normalizing: '整理内容',
  segmenting: '生成知识片段',
  'rag-ingestion': 'RAG 接入',
  'preview-converting': '生成预览页面',
  'preview-publishing': '发布预览页面',
  completed: '已完成',
};

/** 打开文件任务业务详情。 */
async function open(taskId: string) {
  detail.value = await api('/documents/processing-detail', { taskId });
  visible.value = true;
}

/** 取消仍处于活动状态的任务。 */
async function cancel() {
  if (!detail.value) return;
  await confirm({
    title: '确认取消该文件处理任务？',
    async confirmCallback() {
      await api('/documents/processing-cancel', { taskId: detail.value!.taskId });
      notify('success', '任务已取消');
      await open(detail.value!.taskId);
      emit('changed');
    },
  });
}

/** 基于当前历史记录创建一次新的执行。 */
async function retry() {
  if (!detail.value) return;
  const task = await api('/documents/processing-retry', {
    taskId: detail.value.taskId,
  });
  notify('success', `已创建第 ${task.executionNo} 次执行`);
  await open(task.taskId);
  emit('changed');
}

/** 将接口时间转换为本地时间文案。 */
function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString();
}

/** 返回阶段业务文案。 */
function getStageLabel(stage: FileProcessingStage) {
  return stageLabels[stage];
}

/** 返回任务状态业务文案。 */
function getTaskStatusLabel(status: FileProcessingTaskStatus) {
  return taskStatusLabels[status];
}

defineExpose({ open });
</script>
