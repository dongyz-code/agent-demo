<template>
  <v-dialog v-model="visible" :title="dialogTitle" width="720px">
    <input
      ref="inputRef"
      class="hidden"
      type="file"
      :accept="accept"
      multiple
      @change="selectFiles"
    />
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
        :disabled="!canStartUpload || uploadingBatch"
        :loading="uploadingBatch"
        @click="upload"
      >
        开始上传
      </el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElButton } from 'element-plus';
import { VDialog } from '@repo/ui';

import UploadQueue from './UploadQueue.vue';
import { useUploader } from './useUploader';
import { notify } from '@/utils';

import type { DocumentUploadResult, UploadPolicyKey } from '@/types';

const props = withDefaults(defineProps<{
  /** 服务端上传策略。 */
  policyKey?: UploadPolicyKey;
  /** GoldenRetriever 持久化空间的稳定用途键。 */
  instanceKey: string;
  /** 单次最多选择的文件数量；上传新版本时应设为 1。 */
  maxNumberOfFiles?: number;
}>(), {
  policyKey: 'default-attachment',
});

const emit = defineEmits<{
  /** 单个文件完成验证并创建文档版本。 */
  uploaded: [result: DocumentUploadResult];
}>();

const visible = ref(false);
const inputRef = ref<HTMLInputElement>();
const targetDocumentId = ref<string>();
const dialogTitle = computed(() =>
  targetDocumentId.value ? '上传文档新版本' : '上传新文档',
);
const {
  items,
  uploadingBatch,
  accept,
  addFiles,
  upload,
  pauseResume,
  remove,
  retry,
  prepareContext,
  clearDismissedFiles,
} = useUploader({
  instanceKey: props.instanceKey,
  policyKey: props.policyKey,
  maxNumberOfFiles: props.maxNumberOfFiles,
  getProcessingIntent() {
    return { documentId: targetDocumentId.value, enterRag: false };
  },
  onUploaded(file) {
    emit('uploaded', file);
  },
});
const canStartUpload = computed(() =>
  items.value.some((item) => item.stage === 'waiting'),
);

watch(visible, (nextVisible) => {
  if (!nextVisible) void clearDismissedFiles();
});

/** 打开上传弹窗时可指定已有文档作为新版本目标。 */
async function open(options?: {
  /** 已有文档标识；提供时本次只允许上传一个新版本。 */
  documentId?: string;
}) {
  await prepareContext(options?.documentId);
  targetDocumentId.value = options?.documentId;
  visible.value = true;
}

/** 将 input 选择结果加入 Uppy 队列。 */
function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    const errors = addFiles(input.files);
    if (errors.length) notify('error', errors.join('；'));
  }
  input.value = '';
}

defineExpose({ open });
</script>
