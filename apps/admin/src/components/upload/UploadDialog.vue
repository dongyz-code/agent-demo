<template>
  <v-dialog v-model="visible" :title="dialogTitle" width="720px">
    <input ref="inputRef" class="hidden" type="file" multiple @change="selectFiles" />
    <div v-if="enableRag" class="mb-4 rounded border border-gray-200 p-3">
      <div class="flex items-center justify-between">
        <span>上传后进入 RAG</span>
        <el-switch v-model="enterRag" />
      </div>
      <el-select
        v-if="enterRag"
        v-model="datasetIds"
        class="mt-3 w-full"
        clearable
        multiple
        collapse-tags
        collapse-tags-tooltip
        placeholder="请选择一个或多个知识库"
      >
        <el-option
          v-for="dataset in datasets"
          :key="dataset.datasetId"
          :label="dataset.name"
          :value="dataset.datasetId"
        />
      </el-select>
      <div v-if="enterRag && !datasets.length" class="mt-2 text-sm text-orange-500">
        暂无启用知识库，请先创建知识库。
      </div>
    </div>
    <div class="mb-3 flex justify-end">
      <el-button @click="inputRef?.click()">选择文件</el-button>
    </div>
    <upload-queue
      :items="items"
      @pause-resume="pauseResume"
      @remove="remove"
      @retry="retry"
    />
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button
        type="primary"
        :disabled="!items.length || (enableRag && enterRag && !datasetIds.length)"
        @click="upload"
      >
        开始上传
      </el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElButton, ElOption, ElSelect, ElSwitch } from 'element-plus';
import { VDialog } from '@repo/ui';

import UploadQueue from './UploadQueue.vue';
import { useUploader } from './useUploader';
import { api } from '@/utils';

import type { DocumentUploadResult, UploadPolicyKey } from '@/types';

const props = withDefaults(defineProps<{
  /** 服务端上传策略。 */
  policyKey?: UploadPolicyKey;
  /** 是否展示上传后进入 RAG 的业务选项。 */
  enableRag?: boolean;
  /** 单次最多选择的文件数量；上传新版本时应设为 1。 */
  maxNumberOfFiles?: number;
}>(), {
  policyKey: 'default-attachment',
  enableRag: false,
});

const emit = defineEmits<{
  /** 单个文件完成验证并创建文档版本。 */
  uploaded: [result: DocumentUploadResult];
}>();

const visible = ref(false);
const inputRef = ref<HTMLInputElement>();
const enterRag = ref(false);
const datasetIds = ref<string[]>([]);
const datasets = ref<{ datasetId: string; name: string }[]>([]);
const targetDocumentId = ref<string>();
const dialogTitle = computed(() =>
  targetDocumentId.value ? '上传文档新版本' : '上传新文档',
);
const { items, addFiles, upload, pauseResume, remove, retry, clearCompleted } = useUploader({
  policyKey: props.policyKey,
  maxNumberOfFiles: props.maxNumberOfFiles,
  getProcessingIntent() {
    return props.enableRag
      ? {
          documentId: targetDocumentId.value,
          enterRag: enterRag.value,
          datasetIds: datasetIds.value,
        }
      : { documentId: targetDocumentId.value, enterRag: false };
  },
  onUploaded(file) {
    emit('uploaded', file);
  },
});

watch(visible, (nextVisible) => {
  if (!nextVisible) clearCompleted();
});

/** 打开上传弹窗时可指定已有文档和本次 RAG 默认选择。 */
async function open(options?: {
  /** 已有文档标识；提供时本次只允许上传一个新版本。 */
  documentId?: string;
  /** 本次是否默认进入 RAG。 */
  enterRag?: boolean;
  /** 默认选择的多个知识库。 */
  datasetIds?: string[];
}) {
  targetDocumentId.value = options?.documentId;
  if (props.enableRag) {
    const result = await api('/documents/dataset-list', {
      status: ['active'],
      limit: [0, 1000],
    });
    datasets.value = result.list;
    datasetIds.value = (options?.datasetIds ?? []).filter((datasetId) =>
      result.list.some((dataset) => dataset.datasetId === datasetId),
    );
    enterRag.value =
      options?.enterRag ?? (result.list.length > 0);
  }
  visible.value = true;
}

/** 将 input 选择结果加入 Uppy 队列。 */
function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) addFiles(input.files);
  input.value = '';
}

defineExpose({ open });
</script>
