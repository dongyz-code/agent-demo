<template>
  <v-dialog
    v-model="visible"
    :title="title"
    width="min(1180px, 92vw)"
    top="5vh"
    append-to-body
    destroy-on-close
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    body-class="max-h-[78vh] overflow-auto text-inherit! text-base!"
  >
    <div v-loading="loading" class="min-h-40">
      <template v-if="document && selectedVersion">
        <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span class="text-sm text-gray-600">查看版本</span>
          <el-select
            v-model="selectedVersionId"
            class="w-72"
            :disabled="saving"
          >
            <el-option
              v-for="version in document.versions"
              :key="version.documentVersionId"
              :label="versionLabel(version)"
              :value="version.documentVersionId"
            />
          </el-select>
          <div class="ml-auto flex flex-wrap items-center">
            <el-button link :disabled="saving" @click="download">
              下载此版本
            </el-button>
            <el-button
              v-if="canSetActive"
              link
              type="primary"
              :loading="saving"
              @click="setActive"
            >
              设为当前版本
            </el-button>
            <el-button
              v-if="capabilities.canUpdate"
              link
              :disabled="saving"
              @click="uploadVersion"
            >
              上传新版本
            </el-button>
            <el-button
              v-if="capabilities.canUpdate"
              link
              :disabled="saving"
              @click="move"
            >
              移动到资料库
            </el-button>
            <el-button
              v-if="canRegenerate"
              link
              :disabled="saving"
              @click="retryPreview"
            >
              重新生成预览
            </el-button>
          </div>
        </div>
        <el-descriptions border :column="2" class="mb-4">
          <el-descriptions-item label="资料库">
            {{ libraryLabel }}
          </el-descriptions-item>
          <el-descriptions-item label="文件名">
            {{ selectedVersion.filename }}
          </el-descriptions-item>
          <el-descriptions-item label="大小">
            {{ formatFileSize(selectedVersion.size) }} ·
            {{ selectedVersion.extension.toUpperCase() }}
          </el-descriptions-item>
          <el-descriptions-item label="上传时间">
            {{ formatDateTime(selectedVersion.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="预览">
            <el-tag
              size="small"
              :type="getPreviewTagType(selectedVersion.previewStatus)"
            >
              {{ previewStatusLabels[selectedVersion.previewStatus] }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="索引">
            <el-tag
              size="small"
              :type="getPreviewTagType(selectedVersion.ragStatus)"
            >
              {{ retrievalText(selectedVersion) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item
            v-if="selectedVersion.previewError"
            label="预览失败"
            :span="2"
          >
            {{ selectedVersion.previewError }}
          </el-descriptions-item>
          <el-descriptions-item
            v-if="selectedVersion.ragError"
            label="索引失败"
            :span="2"
          >
            {{ selectedVersion.ragError }}
          </el-descriptions-item>
        </el-descriptions>
        <document-viewer
          :key="`${selectedVersionId}-${previewNonce}`"
          :document-id="document.documentId"
          :document-version-id="selectedVersionId"
        />
      </template>
      <el-empty
        v-else-if="!loading"
        description="文档不存在或你已无权访问"
      />
    </div>
    <document-move-dialog ref="moveDialogRef" @changed="applyDocument" />
    <document-uploader ref="uploaderRef" @uploaded="handleUploaded" />
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import {
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElEmpty,
  ElOption,
  ElSelect,
  ElTag,
} from 'element-plus';
import { VDialog } from '@repo/ui';

import DocumentUploader from '@/components/upload/DocumentUploader.vue';
import DocumentViewer from '@/components/document-viewer/DocumentViewer.vue';
import { useStore } from '@/models';
import { api, notify } from '@/utils';
import DocumentMoveDialog from './DocumentMoveDialog.vue';
import {
  formatDateTime,
  formatFileSize,
  getDocumentCapabilities,
  getPreviewTagType,
  previewStatusLabels,
  ragStatusLabels,
} from '../utils';

import type { DocumentDetail, DocumentUploadResult, DocumentVersionInfo } from '@/types';

const emit = defineEmits<{
  /** 版本、所属库或预览状态已变化，列表需要刷新。 */
  changed: [];
}>();

const store = useStore();
const visible = ref(false);
const loading = ref(false);
const saving = ref(false);
const currentId = ref('');
const selectedVersionId = ref('');
const previewNonce = ref(0);
const document = shallowRef<DocumentDetail>();
const moveDialogRef = ref<InstanceType<typeof DocumentMoveDialog>>();
const uploaderRef = ref<InstanceType<typeof DocumentUploader>>();
/** 连续打开或刷新时，只接受最后一次详情响应。 */
let requestSequence = 0;

const title = computed(() => document.value?.name || '文档详情');
const capabilities = computed(() =>
  getDocumentCapabilities(document.value, store.hasPermission),
);
const selectedVersion = computed(() =>
  document.value?.versions.find(
    (version) => version.documentVersionId === selectedVersionId.value,
  ),
);
const libraryLabel = computed(() => {
  if (!document.value?.libraryId) return '未归库';
  return document.value.libraryName;
});
const canSetActive = computed(() => {
  if (!capabilities.value.canUpdate || !selectedVersion.value || !document.value) {
    return false;
  }
  return (
    selectedVersion.value.documentVersionId !==
    document.value.activeVersion.documentVersionId
  );
});
const canRegenerate = computed(() => {
  if (!capabilities.value.canProcess || !selectedVersion.value) return false;
  return !['pending', 'processing'].includes(selectedVersion.value.previewStatus);
});

/**
 * 打开文档详情，并读取版本历史。
 * @param documentId 要查看的文档标识。
 */
async function open(documentId: string) {
  if (saving.value) return;
  currentId.value = documentId;
  document.value = undefined;
  selectedVersionId.value = '';
  visible.value = true;
  await load();
}

/**
 * 读取当前文档。已选版本仍存在时保留，否则回到当前展示版本。
 */
async function load() {
  const documentId = currentId.value;
  const sequence = ++requestSequence;
  if (!documentId) return;
  loading.value = true;
  try {
    const result = await api('/documents/document-detail', { documentId });
    if (sequence !== requestSequence || currentId.value !== documentId) return;
    document.value = result;
    const exists = result.versions.some(
      (version) => version.documentVersionId === selectedVersionId.value,
    );
    if (!exists) {
      selectedVersionId.value = result.activeVersion.documentVersionId;
    }
  } catch {
    if (sequence === requestSequence) {
      document.value = undefined;
      selectedVersionId.value = '';
    }
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

/**
 * 版本下拉文案，标出当前展示版本和问答实际使用的版本。
 * @param version 下拉中的一个历史版本。
 * @returns 带标记的版本号。
 */
function versionLabel(version: DocumentVersionInfo) {
  const marks = [`V${version.version}`];
  if (!document.value) return marks[0] ?? '';
  if (
    version.documentVersionId === document.value.activeVersion.documentVersionId
  ) {
    marks.push('当前');
  }
  if (version.documentVersionId === document.value.indexedVersionId) {
    marks.push('问答使用');
  }
  return marks.join(' · ');
}

/**
 * 说明这个版本自己的索引进度；被问答使用时直接标明。
 * @param version 当前正在查看的版本。
 * @returns 索引列文案。
 */
function retrievalText(version: DocumentVersionInfo) {
  if (version.documentVersionId === document.value?.indexedVersionId) {
    return '问答使用此版本';
  }
  return ragStatusLabels[version.ragStatus];
}

/** 下载当前查看的版本，不把历史版本误当成当前版本。 */
async function download() {
  if (!document.value || !selectedVersion.value) return;
  const result = await api('/documents/document-download', {
    documentId: document.value.documentId,
    documentVersionId: selectedVersion.value.documentVersionId,
  });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

/** 把正在查看的历史版本设为默认展示版本，不改变问答使用的版本。 */
async function setActive() {
  if (!canSetActive.value || saving.value || !document.value) return;
  saving.value = true;
  const documentId = document.value.documentId;
  try {
    const next = await api('/documents/document-version-set-active', {
      documentId,
      documentVersionId: selectedVersionId.value,
    });
    if (currentId.value !== documentId) return;
    document.value = next;
    notify('success', '已设为当前展示版本');
    emit('changed');
  } finally {
    saving.value = false;
  }
}

/** 为当前文档上传新版本，不在这个流程里改所属资料库。 */
function uploadVersion() {
  if (!document.value || saving.value) return;
  void uploaderRef.value?.open({
    documentId: document.value.documentId,
    libraryId: document.value.libraryId,
  });
}

/** 打开移动弹窗，目标库由弹窗按管理身份筛选。 */
function move() {
  if (!document.value || saving.value) return;
  void moveDialogRef.value?.open(document.value);
}

/** 重新生成当前查看版本的页面预览，不重做问答索引。 */
async function retryPreview() {
  if (!canRegenerate.value || saving.value || !document.value || !selectedVersion.value) {
    return;
  }
  saving.value = true;
  const documentId = document.value.documentId;
  try {
    await api('/documents/document-preview-retry', {
      documentId,
      documentVersionId: selectedVersion.value.documentVersionId,
    });
    if (currentId.value !== documentId) return;
    previewNonce.value += 1;
    notify('success', '已提交预览生成任务');
    await load();
    emit('changed');
  } finally {
    saving.value = false;
  }
}

/**
 * 新版本入库后刷新详情，并切到新的当前版本。
 * @param result 上传流程返回的版本摘要。
 */
async function handleUploaded(result: DocumentUploadResult) {
  const documentId = currentId.value;
  selectedVersionId.value = '';
  await load();
  if (currentId.value !== documentId) return;
  if (document.value) notify('success', `文档 V${result.version} 已入库`);
  emit('changed');
}

/**
 * 接收移动结果。单份移动带回新详情，列表同时刷新所属库。
 * @param next 移动后的文档；批量失败重试时可能为空。
 */
function applyDocument(next: DocumentDetail | undefined) {
  if (!next || next.documentId !== currentId.value) {
    emit('changed');
    return;
  }
  document.value = next;
  const exists = next.versions.some(
    (version) => version.documentVersionId === selectedVersionId.value,
  );
  if (!exists) {
    selectedVersionId.value = next.activeVersion.documentVersionId;
  }
  emit('changed');
}

defineExpose({ open });
</script>
