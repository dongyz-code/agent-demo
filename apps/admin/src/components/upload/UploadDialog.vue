<template>
  <v-dialog v-model="visible" :title="dialogTitle" width="720px">
    <input
      ref="inputRef"
      class="hidden"
      type="file"
      :accept="accept"
      :multiple="allowsMultipleFiles"
      @change="selectFiles"
    />
    <div
      class="group mb-4 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      :class="dropzoneClasses"
      role="button"
      tabindex="0"
      @click="inputRef?.click()"
      @keydown.enter="inputRef?.click()"
      @keydown.space.prevent="inputRef?.click()"
      @dragenter.prevent.stop="handleDragEnter"
      @dragover.prevent.stop
      @dragleave.prevent.stop="handleDragLeave"
      @drop.prevent.stop="handleDrop"
    >
      <div
        class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-500 transition-transform group-hover:scale-105"
      >
        <lucide-cloud-upload class="h-7 w-7" />
      </div>
      <div class="text-base font-medium text-gray-700">
        {{ dropzoneTitle }}
      </div>
      <div class="mt-2 text-sm text-gray-500">
        {{ selectionHint }}
      </div>
      <div class="mt-3 max-w-full text-xs leading-5 text-gray-400">
        支持 {{ supportedTypesText }}
      </div>
    </div>
    <upload-queue
      v-if="items.length"
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

import LucideCloudUpload from '~icons/lucide/cloud-upload';

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
const isDragging = ref(false);
let dragDepth = 0;
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
const allowsMultipleFiles = computed(() => props.maxNumberOfFiles !== 1);
const selectionHint = computed(() => {
  if (allowsMultipleFiles.value) return '或点击选择文件，可一次选择多个文件';
  return '或点击选择一个文件';
});
const supportedTypesText = computed(() =>
  accept
    .split(',')
    .map((extension) => extension.replace('.', '').toUpperCase())
    .join('、'),
);
const dropzoneTitle = computed(() => {
  if (isDragging.value) return '松开鼠标即可加入上传队列';
  return '将文件拖拽到这里';
});
const dropzoneClasses = computed(() => {
  if (isDragging.value) return 'border-blue-500 bg-blue-50/70';
  return 'border-gray-300 bg-gray-50/70 hover:border-blue-400 hover:bg-blue-50/40';
});

watch(visible, (nextVisible) => {
  if (nextVisible) return;
  isDragging.value = false;
  dragDepth = 0;
  void clearDismissedFiles();
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

/**
 * 将 input 选择结果加入 Uppy 队列并清空 input，允许再次选择同一文件。
 *
 * @param event 文件输入框的 change 事件。
 */
function selectFiles(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files) enqueueFiles(input.files);
  input.value = '';
}

/** 记录进入拖拽区域的层级，避免经过子元素时提前取消高亮。 */
function handleDragEnter(): void {
  dragDepth += 1;
  isDragging.value = true;
}

/** 退出最后一层拖拽区域时恢复默认外观。 */
function handleDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) isDragging.value = false;
}

/**
 * 接收拖入的本地文件并加入现有上传队列。
 *
 * @param event 浏览器 drop 事件。
 */
function handleDrop(event: DragEvent): void {
  dragDepth = 0;
  isDragging.value = false;
  const files = event.dataTransfer?.files;
  if (files?.length) enqueueFiles(files);
}

/**
 * 通过统一入口添加文件并展示客户端校验结果。
 *
 * @param files 浏览器选择或拖入的文件集合。
 */
function enqueueFiles(files: FileList): void {
  const errors = addFiles(files);
  if (errors.length) notify('error', errors.join('；'));
}

defineExpose({ open });
</script>
