<template>
  <v-dialog
    v-model="visible"
    :title="title"
    width="min(1080px, 92vw)"
    append-to-body
    destroy-on-close
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
  >
    <div v-loading="loading" class="min-h-40">
      <v-table
        v-if="document"
        :data="versions"
        :rows="columns"
        :props="{ emptyText: '还没有上传版本' }"
      >
        <template #version="{ row }">
          <span class="inline-flex flex-nowrap items-center gap-2">
            <span>V{{ row.version }}</span>
            <el-tag v-if="isCurrent(row)" size="small">主版本</el-tag>
          </span>
        </template>
        <template #filename="{ row }">
          <span class="block truncate" :title="row.filename">
            {{ row.filename }}
          </span>
        </template>
        <template #createdAt="{ row }">
          {{ formatDateTime(row.createdAt) }}
        </template>
        <template #actions="{ row }">
          <div class="flex flex-nowrap items-center">
            <el-button link :disabled="saving" @click="download(row)">
              下载
            </el-button>
            <el-button
              v-if="canSetMain(row)"
              link
              type="primary"
              :loading="savingId === row.documentVersionId"
              :disabled="saving"
              @click="setMain(row)"
            >
              设为主版本
            </el-button>
          </div>
        </template>
      </v-table>
      <el-empty v-else-if="!loading" description="文档不存在或你已无权访问" />
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { ElButton, ElEmpty, ElTag } from 'element-plus';
import { VDialog, VTable } from '@repo/ui';

import { useStore } from '@/models';
import { api, notify } from '@/utils';
import { formatDateTime, getDocumentCapabilities } from '../utils';

import type { DocumentDetail, DocumentVersionInfo } from '@/types';
import type { TableRow } from '@repo/ui';

const emit = defineEmits<{
  /** 当前展示版本已切换，列表和详情需要使用新的文档。 */
  changed: [document: DocumentDetail];
}>();

const store = useStore();
const visible = ref(false);
const loading = ref(false);
const saving = ref(false);
const savingId = ref('');
const currentId = ref('');
const document = shallowRef<DocumentDetail>();
/** 连续打开不同文档时，只展示最后一次版本列表。 */
let requestSequence = 0;

const title = computed(() => {
  if (!document.value) return '版本';
  return `${document.value.name}的版本`;
});
const versions = computed(() =>
  (document.value?.versions ?? []).map((version) => ({ ...version })),
);
const capabilities = computed(() =>
  getDocumentCapabilities(document.value, store.hasPermission),
);
const columns: TableRow[] = [
  { label: '版本', value: 'version', slot: 'version', minWidth: 16 },
  { label: '文件', value: 'filename', slot: 'filename', minWidth: 40 },
  { label: '上传时间', value: 'createdAt', slot: 'createdAt', minWidth: 20 },
  { label: '操作', value: 'actions', slot: 'actions', minWidth: 24 },
];

/**
 * 打开某个文档的全部上传版本。
 * @param documentId 文档标识。
 */
async function open(documentId: string) {
  if (saving.value) return;
  currentId.value = documentId;
  document.value = undefined;
  visible.value = true;
  await load();
}

/** 读取版本历史。失败时不保留上一份文档。 */
async function load() {
  const documentId = currentId.value;
  const sequence = ++requestSequence;
  if (!documentId) return;
  loading.value = true;
  try {
    const result = await api('/documents/document-detail', { documentId });
    if (sequence !== requestSequence || currentId.value !== documentId) return;
    document.value = result;
  } catch {
    if (sequence === requestSequence) document.value = undefined;
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

/**
 * 是否为列表和预览默认展示的版本。
 * @param version 版本行。
 * @returns 是当前展示版本时返回 true。
 */
function isCurrent(version: DocumentVersionInfo) {
  return (
    version.documentVersionId ===
    document.value?.activeVersion.documentVersionId
  );
}

/**
 * 是否为问答实际检索的版本。
 * @param version 版本行。
 * @returns 是问答使用版本时返回 true。
 */
function isIndexed(version: DocumentVersionInfo) {
  return version.documentVersionId === document.value?.indexedVersionId;
}

/**
 * 还不是主版本时才显示设置按钮。
 * @param version 版本行。
 * @returns 是否允许设为主版本。
 */
function canSetMain(version: DocumentVersionInfo) {
  if (!capabilities.value.canUpdate) return false;
  return !isCurrent(version);
}

/**
 * 下载这一版上传时的源文件。
 * @param version 要下载的版本。
 */
async function download(version: DocumentVersionInfo) {
  if (!document.value) return;
  const result = await api('/documents/document-download', {
    documentId: document.value.documentId,
    documentVersionId: version.documentVersionId,
  });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

/**
 * 把所选版本设为主版本。若问答还没用这一版，同时提交索引。
 * @param version 要设为主版本的历史上传。
 */
async function setMain(version: DocumentVersionInfo) {
  if (!canSetMain(version) || !document.value) return;
  saving.value = true;
  savingId.value = version.documentVersionId;
  const documentId = document.value.documentId;
  const needsIndex = !isIndexed(version);
  try {
    const next = await api('/documents/document-version-set-active', {
      documentId,
      documentVersionId: version.documentVersionId,
    });
    if (currentId.value !== documentId) return;
    document.value = next;
    if (needsIndex && capabilities.value.canProcess) {
      await api('/documents/document-preview-retry', {
        documentId,
        documentVersionId: version.documentVersionId,
      });
      const refreshed = await api('/documents/document-detail', { documentId });
      if (currentId.value !== documentId) return;
      document.value = refreshed;
      notify('success', '已设为主版本，并开始建立问答索引');
      emit('changed', refreshed);
      return;
    }
    if (needsIndex) {
      notify('success', '已设为主版本。问答仍使用原来的索引版本');
    } else {
      notify('success', '已设为主版本');
    }
    emit('changed', next);
  } finally {
    saving.value = false;
    savingId.value = '';
  }
}

defineExpose({ open });
</script>
