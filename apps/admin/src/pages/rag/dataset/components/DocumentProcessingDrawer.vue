<template>
  <el-drawer v-model="visible" title="文档处理任务" size="680px" @closed="stopPolling">
    <el-table v-loading="loading" :data="jobs">
      <el-table-column prop="stage" label="阶段" width="110" />
      <el-table-column prop="status" label="状态" width="110" />
      <el-table-column prop="errorMessage" label="错误" min-width="180" show-overflow-tooltip />
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <el-button link @click="showDetail(row.jobId)">详情</el-button>
          <el-button v-if="row.status === 'failed'" link type="primary" @click="retry(row.jobId)">重试</el-button>
          <el-button v-if="['pending', 'running'].includes(row.status)" link type="danger" @click="cancel(row.jobId)">取消</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-timeline v-if="detail" class="mt-5">
      <el-timeline-item
        v-for="run in detail.stageRuns"
        :key="`${run.stage}-${run.attempt}`"
        :timestamp="`${run.stage} / 第 ${run.attempt} 次`"
      >
        {{ run.status }}<span v-if="run.errorMessage">：{{ run.errorMessage }}</span>
      </el-timeline-item>
    </el-timeline>
  </el-drawer>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { ElButton, ElDrawer, ElTable, ElTableColumn, ElTimeline, ElTimelineItem } from 'element-plus';

import { api } from '@/utils';

type JobList = Awaited<ReturnType<typeof api<'/document/processing/list'>>>['list'];
type JobDetail = Awaited<ReturnType<typeof api<'/document/processing/detail'>>>;

const visible = ref(false);
const loading = ref(false);
const jobs = ref<JobList>([]);
const detail = ref<JobDetail>();
let documentId = '';
let pollTimer: ReturnType<typeof setTimeout> | undefined;

/** 打开指定文档的处理任务抽屉。 */
async function open(nextDocumentId: string) {
  documentId = nextDocumentId;
  detail.value = undefined;
  visible.value = true;
  await load();
}

/** 加载文档处理任务。 */
async function load() {
  stopPolling();
  loading.value = true;
  try {
    const result = await api('/document/processing/list', {
      documentId,
      limit: [0, 50],
    });
    jobs.value = result.list;
  } finally {
    loading.value = false;
    if (
      visible.value &&
      jobs.value.some((job) => ['pending', 'running'].includes(job.status))
    ) {
      pollTimer = setTimeout(load, 3000);
    }
  }
}

/** 查看任务阶段日志。 */
async function showDetail(jobId: string) {
  detail.value = await api('/document/processing/detail', { jobId });
}

/** 重试失败的文档处理任务。 */
async function retry(jobId: string) {
  await api('/document/processing/retry', { jobId });
  await load();
}

/** 取消未完成的文档处理任务。 */
async function cancel(jobId: string) {
  await api('/document/processing/cancel', { jobId });
  await load();
}

/** 停止文档任务自动刷新。 */
function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}

onBeforeUnmount(stopPolling);
defineExpose({ open });
</script>
