<template>
  <el-drawer v-model="visible" title="执行详情" size="min(900px, 100vw)">
    <div class="mb-4 flex items-center justify-between">
      <strong>{{ detail?.run.scheduleName }}</strong>
      <el-button :loading="loading" @click="load">刷新详情</el-button>
    </div>
    <el-alert
      v-if="failed"
      type="error"
      :closable="false"
      title="详情加载失败，请刷新重试。"
    />
    <template v-if="detail">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="状态">
          <el-tag :type="runStatusType(detail.run.status)">
            {{ runLabels[detail.run.status] }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="计划时间">
          {{ monitorTime(detail.run.plannedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="实际开始">
          {{ monitorTime(detail.run.startedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="结束时间">
          {{ monitorTime(detail.run.finishedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="执行耗时">
          {{ duration }}
        </el-descriptions-item>
        <el-descriptions-item label="执行尝试">
          {{ detail.run.attempts }} 次
        </el-descriptions-item>
        <el-descriptions-item label="触发来源">
          <span v-if="detail.run.trigger === 'manual'">人工执行</span>
          <span v-else>自动调度</span>
        </el-descriptions-item>
        <el-descriptions-item label="任务标识">
          <code class="break-all">{{ detail.run.taskId ?? '未入队' }}</code>
        </el-descriptions-item>
        <el-descriptions-item v-if="detail.run.message" label="结果说明">
          <span class="break-all whitespace-pre-wrap">
            {{ detail.run.message }}
          </span>
        </el-descriptions-item>
      </el-descriptions>
      <template v-if="detail.task">
        <h3 class="mt-6 mb-3 font-medium">任务进度</h3>
        <el-progress :percentage="detail.task.progress" />
        <p class="mt-2 text-sm text-gray-600">
          {{ stageText }}
        </p>
        <h3 class="mt-6 mb-3 font-medium">执行日志</h3>
        <pre
          class="max-h-[50vh] overflow-auto rounded bg-gray-950 p-4 text-xs leading-6 whitespace-pre-wrap text-gray-100"
          v-text="logText"
        />
      </template>
      <p v-else class="mt-5 text-sm text-gray-600">
        本次触发未创建执行任务，原因见结果说明。
      </p>
    </template>
  </el-drawer>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import {
  ElAlert,
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElDrawer,
  ElProgress,
  ElTag,
} from 'element-plus';
import { api } from '@/utils';
import { monitorTime, runLabels, runStatusType } from '../../utils';
import type { ApiSys } from '@/types';

const visible = ref(false);
const loading = ref(false);
const failed = ref(false);
const id = ref('');
const detail = ref<ApiSys.ScheduleManagementAction['detail']['resp']>();
/** 未报告业务阶段时以真实生命周期兜底，终态不能仍显示等待执行。 */
const stageText = computed(() => {
  const current = detail.value;
  if (!current) return '';
  if (current.task?.current_stage) return current.task.current_stage;
  if (current.run.status === 'succeeded') return '执行完成';
  if (current.run.status === 'queued') return '等待执行';
  if (current.run.status === 'failed') return '执行失败';
  return runLabels[current.run.status];
});
/** 首次执行到最终完成的总耗时包含重试等待；执行中不显示虚假终值。 */
const duration = computed(() => {
  const run = detail.value?.run;
  if (!run?.startedAt) return '尚未开始';
  if (!run.finishedAt) return '尚未结束';
  const milliseconds =
    new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  return `${(milliseconds / 1000).toFixed(2)} 秒（含重试等待）`;
});
const logText = computed(
  () =>
    detail.value?.logs
      .map(
        (log) =>
          `${monitorTime(String(log.create_timestamp))} [${log.level}] #${log.attempt} ${log.message}`,
      )
      .join('\n') || '暂无执行日志',
);
/** 切换或关闭抽屉后废弃旧请求。 */
let sequence = 0;
/**
 * 打开独立的触发详情。
 * @param runId 台账标识，不接受任意任务标识。
 */
async function open(runId: string): Promise<void> {
  sequence += 1;
  loading.value = false;
  failed.value = false;
  id.value = runId;
  detail.value = undefined;
  visible.value = true;
  await load();
}
/** 拉取状态及任务日志，失败时保留已有详情。 */
async function load(): Promise<void> {
  if (!visible.value || loading.value) return;
  const current = ++sequence;
  loading.value = true;
  try {
    const result = await api('/sys/schedule/detail', { id: id.value });
    if (current === sequence) {
      detail.value = result;
      failed.value = false;
    }
  } catch {
    if (current === sequence) failed.value = true;
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(visible, (value) => {
  if (!value) {
    sequence += 1;
    loading.value = false;
  }
});
useIntervalFn(() => {
  if (
    visible.value &&
    !failed.value &&
    detail.value &&
    ['queued', 'running', 'retrying'].includes(detail.value.run.status) &&
    document.visibilityState === 'visible'
  )
    void load();
}, 5000);
defineExpose({ open });
</script>
