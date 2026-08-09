<template>
  <v-dialog v-model="visible" :title="title" width="88%" top="4vh">
    <div v-loading="loading" class="flex max-h-[78vh] flex-col gap-4 overflow-auto">
      <template v-if="detail">
        <el-descriptions border :column="3" size="small">
          <el-descriptions-item label="任务名称">
            {{ detail.task_name }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTagType(detail.status)" effect="light">
              {{ staticMapping.task_status.get(detail.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="执行次数">
            {{ detail.attempt_count }} / {{ detail.max_retries + 1 }}
          </el-descriptions-item>
          <el-descriptions-item label="当前阶段">
            {{ detail.current_stage ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="进度">
            {{ detail.progress }}%
          </el-descriptions-item>
          <el-descriptions-item label="下次执行">
            {{ formatTimestamp(detail.next_run_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="重试间隔">
            {{ handleTime(detail.retry_delay_ms) }}
          </el-descriptions-item>
          <el-descriptions-item label="单次超时">
            {{ handleTime(detail.timeout_ms) }}
          </el-descriptions-item>
          <el-descriptions-item label="同名并发">
            {{ detail.concurrency }}
          </el-descriptions-item>
          <el-descriptions-item label="错误摘要" :span="3">
            {{ detail.error_message ?? '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <section>
          <h3 class="mb-2 text-sm font-medium">执行尝试</h3>
          <el-table :data="detail.attempts" border size="small">
            <el-table-column label="次数" prop="attempt" width="72" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="getStatusTagType(row.status)" effect="plain">
                  {{ formatAttemptStatus(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Worker" prop="worker_id" min-width="220" />
            <el-table-column label="PID" prop="process_id" width="90" />
            <el-table-column label="开始时间" width="180">
              <template #default="{ row }">
                {{ formatTimestamp(row.start_timestamp) }}
              </template>
            </el-table-column>
            <el-table-column label="结束时间" width="180">
              <template #default="{ row }">
                {{ formatTimestamp(row.end_timestamp) }}
              </template>
            </el-table-column>
            <el-table-column label="错误摘要" prop="error_message" min-width="240" />
          </el-table>
        </section>

        <section v-if="canViewLogs">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-medium">结构化日志</h3>
            <el-button link type="primary" @click="loadTask">刷新</el-button>
          </div>
          <el-table :data="logs" border size="small">
            <el-table-column label="时间" width="180">
              <template #default="{ row }">
                {{ formatTimestamp(row.create_timestamp) }}
              </template>
            </el-table-column>
            <el-table-column label="Attempt" prop="attempt" width="90" />
            <el-table-column label="级别" width="90">
              <template #default="{ row }">
                <el-tag :type="getLogTagType(row.level)" effect="plain">
                  {{ row.level }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="消息" prop="message" min-width="420" />
          </el-table>
        </section>
      </template>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import {
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { dayJsformat, handleTime } from '@repo/utils-browser';
import { VDialog } from '@repo/ui';

import { staticMapping } from '@/constants';
import { api } from '@/utils';

import type { TaskDetail, TaskLogItem } from '../types';

/** 任务详情弹窗输入。 */
interface TaskDetailDialogProps {
  /** 是否显示弹窗。 */
  modelValue: boolean;
  /** 当前通用任务标识。 */
  taskId: string;
  /** 弹窗标题。 */
  title: string;
  /** 当前用户是否允许读取技术日志。 */
  canViewLogs: boolean;
}

/** Element Plus 标签支持的语义类型。 */
type TagType = 'success' | 'warning' | 'danger' | 'info' | 'primary';

const props = defineProps<TaskDetailDialogProps>();
const emit = defineEmits<{
  /** 同步弹窗显示状态。 */
  'update:modelValue': [value: boolean];
}>();

const loading = ref(false);
const detail = shallowRef<TaskDetail | null>(null);
const logs = shallowRef<TaskLogItem[]>([]);
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

watch(
  () => [props.modelValue, props.taskId] as const,
  ([opened, taskId]) => {
    if (!opened || !taskId) return;
    void loadTask();
  },
  { immediate: true },
);

/**
 * 刷新当前任务详情、attempt 和可授权日志。
 *
 * @returns 所有允许查询的数据加载完成后结束。
 */
async function loadTask(): Promise<void> {
  if (!props.taskId) return;
  loading.value = true;
  try {
    const detailPromise = api('/sys/task/detail', {
      task_id: props.taskId,
    });
    let logsPromise: Promise<TaskLogItem[]> = Promise.resolve([]);
    if (props.canViewLogs) {
      logsPromise = api('/sys/task/logs', { task_id: props.taskId });
    }
    const [nextDetail, nextLogs] = await Promise.all([
      detailPromise,
      logsPromise,
    ]);
    detail.value = nextDetail;
    logs.value = nextLogs;
  } finally {
    loading.value = false;
  }
}

/**
 * 格式化可空时间。
 *
 * @param value API 返回的时间。
 * @returns 秒级本地时间；空值返回短横线。
 */
function formatTimestamp(value: Date | null): string {
  if (!value) return '-';
  return dayJsformat(value, 'YYYY-MM-DD HH:mm:ss');
}

/**
 * 返回任务或 attempt 状态的标签颜色。
 *
 * @param status 生命周期状态。
 * @returns Element Plus 标签语义类型。
 */
function getStatusTagType(status: string): TagType {
  if (status === 'succeeded') return 'success';
  if (status === 'running') return 'primary';
  if (status === 'queued' || status === 'retrying') return 'warning';
  if (status === 'failed' || status === 'timed_out') return 'danger';
  return 'info';
}

/**
 * 格式化 attempt 专属状态。
 *
 * @param status attempt 状态。
 * @returns 中文状态文案。
 */
function formatAttemptStatus(status: TaskDetail['attempts'][number]['status']): string {
  const mapping: Record<typeof status, string> = {
    running: '执行中',
    succeeded: '成功',
    failed: '失败',
    canceled: '已取消',
    timed_out: '超时',
    interrupted: '已中断',
  };
  return mapping[status];
}

/**
 * 返回日志级别的标签颜色。
 *
 * @param level 结构化日志级别。
 * @returns Element Plus 标签语义类型。
 */
function getLogTagType(level: TaskLogItem['level']): TagType {
  if (level === 'error') return 'danger';
  if (level === 'debug') return 'info';
  return 'primary';
}
</script>
