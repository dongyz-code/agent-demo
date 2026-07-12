<template>
  <section class="flex min-h-0 flex-1 flex-col gap-3">
    <v-schema-form
      v-model="searchForm"
      mode="search"
      :columns="searchColumns"
      @reset="loadSessions(true)"
      @submit="loadSessions(true)"
    />
    <div class="flex justify-end"><page-component @update:model-value="loadSessions()" /></div>
    <v-table class="min-h-0 flex-1" :data="sessions" :rows="rows" :loading="loading">
      <template #policyKey="{ row }">{{ uploadPolicyLabels[row.policyKey] }}</template>
      <template #status="{ row }"><el-tag>{{ uploadStatusLabels[row.status] }}</el-tag></template>
      <template #progress="{ row }">
        <el-progress :percentage="getUploadProgress(row.uploadedSize, row.size)" />
      </template>
      <template #expiresAt="{ row }">{{ formatDateTime(row.expiresAt) }}</template>
      <template #actions="{ row }">
        <el-button link @click="detailRef?.open(row.sessionId)">详情</el-button>
        <el-button v-if="isActiveUploadStatus(row.status)" link type="primary" @click="resume(row)">继续</el-button>
        <el-button v-if="isActiveUploadStatus(row.status)" link type="danger" @click="cancel(row.sessionId)">取消</el-button>
      </template>
    </v-table>
    <upload-session-detail-drawer ref="detailRef" />
    <upload-dialog
      v-if="resumePolicy"
      :key="resumeDialogKey"
      ref="resumeDialogRef"
      :policy-key="resumePolicy"
      @uploaded="loadSessions(true)"
    />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, shallowRef } from 'vue';
import { ElButton, ElProgress, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';

import UploadDialog from '@/components/upload/UploadDialog.vue';
import { api, confirm, notify } from '@/utils';
import UploadSessionDetailDrawer from './UploadSessionDetailDrawer.vue';
import {
  formatDateTime,
  getUploadProgress,
  isActiveUploadStatus,
  uploadPolicyLabels,
  uploadStatusLabels,
} from '../utils';

import type { UploadPolicyKey, UploadSessionInfo, UploadSessionStatus } from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';

type SearchForm = {
  /** 上传会话状态。 */
  status?: UploadSessionStatus;
  /** 上传策略。 */
  policyKey?: UploadPolicyKey;
};

type UploadSessionRow = UploadSessionInfo & Record<string, unknown>;

const searchForm = ref<SearchForm>({});
const sessions = shallowRef<UploadSessionRow[]>([]);
const loading = ref(false);
const detailRef = ref<InstanceType<typeof UploadSessionDetailDrawer>>();
const resumeDialogRef = ref<InstanceType<typeof UploadDialog>>();
const resumePolicy = ref<UploadPolicyKey>();
const resumeDialogKey = ref(0);
const { pageComponent, pageRange, setPageData } = usePage({ page: { size: 20 } });

const searchColumns: SchemaFormColumn<SearchForm>[] = [
  { dataIndex: 'status', title: '状态', valueType: 'select', valueEnum: uploadStatusLabels, fieldProps: { clearable: true } },
  { dataIndex: 'policyKey', title: '策略', valueType: 'select', valueEnum: uploadPolicyLabels, fieldProps: { clearable: true } },
];

const rows: TableRow[] = [
  { label: '文件名', value: 'filename', minWidth: 'normal' },
  { label: '策略', value: 'policyKey', slot: 'policyKey', width: 110 },
  { label: '模式', value: 'mode', width: 100 },
  { label: '状态', value: 'status', slot: 'status', width: 100 },
  { label: '进度', value: 'progress', slot: 'progress', width: 170 },
  { label: '过期时间', value: 'expiresAt', slot: 'expiresAt', width: 180 },
  { label: '操作', value: 'actions', slot: 'actions', width: 170, fixed: 'right' },
];

/** 分页加载当前用户的上传会话。 */
async function loadSessions(withCount = false) {
  if (withCount) setPageData({ current: 1 });
  loading.value = true;
  try {
    const result = await api('/upload/list', {
      status: searchForm.value.status ? [searchForm.value.status] : undefined,
      policyKey: searchForm.value.policyKey ? [searchForm.value.policyKey] : undefined,
      limit: pageRange.value,
      withCount,
    });
    sessions.value = result.list.map((session) => ({ ...session }));
    if (withCount) setPageData({ total: result.count });
  } finally {
    loading.value = false;
  }
}

/** 提示用户重新选择原文件，由稳定指纹恢复服务端会话。 */
async function resume(session: UploadSessionInfo) {
  resumePolicy.value = session.policyKey;
  resumeDialogKey.value += 1;
  await nextTick();
  notify('info', `请重新选择“${session.filename}”，系统会跳过已上传分片`);
  resumeDialogRef.value?.open();
}

/** 取消仍处于活动状态的上传会话。 */
async function cancel(sessionId: string) {
  await confirm({
    title: '确认取消该上传会话？',
    async confirmCallback() {
      await api('/upload/abort', { sessionId });
      await loadSessions(true);
    },
  });
}

onMounted(() => loadSessions(true));
</script>
