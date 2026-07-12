<template>
  <el-drawer v-model="visible" title="上传会话详情" size="560px" @closed="stopPolling">
    <el-descriptions v-if="session" :column="1" border>
      <el-descriptions-item label="文件名">{{ session.filename }}</el-descriptions-item>
      <el-descriptions-item label="策略">{{ uploadPolicyLabels[session.policyKey] }}</el-descriptions-item>
      <el-descriptions-item label="模式">{{ session.mode }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ uploadStatusLabels[session.status] }}</el-descriptions-item>
      <el-descriptions-item label="进度">
        <el-progress :percentage="getUploadProgress(session.uploadedSize, session.size)" />
      </el-descriptions-item>
      <el-descriptions-item label="过期时间">{{ formatDateTime(session.expiresAt) }}</el-descriptions-item>
      <el-descriptions-item v-if="session.errorMessage" label="错误">{{ session.errorMessage }}</el-descriptions-item>
    </el-descriptions>
    <el-table v-if="parts.length" class="mt-4" :data="parts">
      <el-table-column prop="partNumber" label="分片" width="90" />
      <el-table-column prop="size" label="大小">
        <template #default="{ row }">{{ formatFileSize(row.size) }}</template>
      </el-table-column>
      <el-table-column prop="etag" label="ETag" show-overflow-tooltip />
    </el-table>
  </el-drawer>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { ElDescriptions, ElDescriptionsItem, ElDrawer, ElProgress, ElTable, ElTableColumn } from 'element-plus';

import { api } from '@/utils';
import {
  formatDateTime,
  formatFileSize,
  getUploadProgress,
  isActiveUploadStatus,
  uploadPolicyLabels,
  uploadStatusLabels,
} from '../utils';

import type { UploadedPartInfo, UploadSessionInfo } from '@/types';

const visible = ref(false);
const session = shallowRef<UploadSessionInfo>();
const parts = shallowRef<UploadedPartInfo[]>([]);
let sessionId = '';
let pollTimer: ReturnType<typeof setTimeout> | undefined;

/** 打开上传会话详情，并在活动状态下自动刷新。 */
async function open(nextSessionId: string) {
  sessionId = nextSessionId;
  visible.value = true;
  await load();
}

/** 刷新会话与活动 Multipart 的事实分片。 */
async function load() {
  stopPolling();
  session.value = await api('/upload/status', { sessionId });
  if (session.value.mode === 'multipart' && isActiveUploadStatus(session.value.status)) {
    const result = await api('/upload/list-parts', { sessionId });
    parts.value = result.parts;
  } else {
    parts.value = [];
  }
  if (visible.value && isActiveUploadStatus(session.value.status)) {
    pollTimer = setTimeout(load, 3000);
  }
}

/** 停止会话详情自动刷新。 */
function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}

onBeforeUnmount(stopPolling);
defineExpose({ open });
</script>
