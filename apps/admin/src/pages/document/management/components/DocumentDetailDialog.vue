<template>
  <v-dialog v-model="visible" title="文档详情与版本历史" width="900px">
    <div v-if="document" class="space-y-4">
      <div class="rounded bg-gray-50 p-3">
        <div class="text-lg font-medium">{{ document.name }}</div>
        <div class="mt-1 text-sm text-gray-500">
          当前版本 V{{ document.activeVersion.version }} · 共 {{ document.versionCount }} 个版本
        </div>
      </div>
      <el-table :data="document.versions" max-height="520">
        <el-table-column label="版本" width="90">
          <template #default="{ row }">V{{ row.version }}</template>
        </el-table-column>
        <el-table-column prop="filename" label="源文件" min-width="220" />
        <el-table-column label="大小" width="110">
          <template #default="{ row }">{{ formatFileSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="预览" width="110">
          <template #default="{ row }">
            <el-tag :type="getPreviewTagType(row.previewStatus)">
              {{ getPreviewStatusLabel(row.previewStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button link @click="previewRef?.open(document.documentId, row.documentVersionId)">
              预览
            </el-button>
            <el-button link @click="download(row.documentVersionId)">下载</el-button>
            <el-button
              v-if="row.documentVersionId !== document.activeVersion.documentVersionId"
              link
              type="primary"
              @click="setActive(row.documentVersionId)"
            >
              设为当前
            </el-button>
            <el-tag v-else size="small" type="success">当前版本</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <document-preview-dialog ref="previewRef" />
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { ElButton, ElTable, ElTableColumn, ElTag } from 'element-plus';
import { VDialog } from '@repo/ui';

import DocumentPreviewDialog from '@/components/document-viewer/DocumentPreviewDialog.vue';
import { api, notify } from '@/utils';
import { formatDateTime, formatFileSize } from '../utils';

import type {
  DocumentDetail,
  DocumentPreviewStatus,
} from '@/types';

const emit = defineEmits<{
  /** 当前版本切换完成，父列表需要刷新聚合状态。 */
  changed: [];
}>();

const previewStatusLabels: Record<DocumentPreviewStatus, string> = {
  pending: '等待中',
  processing: '生成中',
  ready: '已就绪',
  failed: '失败',
};
const visible = ref(false);
const document = shallowRef<DocumentDetail>();
const previewRef = ref<InstanceType<typeof DocumentPreviewDialog>>();

/** 查询并打开指定文档的完整版本历史。 */
async function open(documentId: string) {
  document.value = await api('/documents/document-detail', { documentId });
  visible.value = true;
}

/** 把同一文档的历史版本切换为当前展示版本。 */
async function setActive(documentVersionId: string) {
  if (!document.value) return;
  document.value = await api('/documents/document-version-set-active', {
    documentId: document.value.documentId,
    documentVersionId,
  });
  notify('success', '当前版本已切换，知识库将按各自状态对齐');
  emit('changed');
}

/** 下载指定历史版本的源文件。 */
async function download(documentVersionId: string) {
  if (!document.value) return;
  const result = await api('/documents/document-download', {
    documentId: document.value.documentId,
    documentVersionId,
  });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

/** 返回预览状态对应的 Element Plus 标签类型。 */
function getPreviewTagType(status: DocumentPreviewStatus) {
  if (status === 'ready') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'processing') return 'warning';
  return 'info';
}

/** 返回预览状态中文文案，供模板的动态行安全索引。 */
function getPreviewStatusLabel(status: DocumentPreviewStatus) {
  return previewStatusLabels[status];
}

defineExpose({ open });
</script>
