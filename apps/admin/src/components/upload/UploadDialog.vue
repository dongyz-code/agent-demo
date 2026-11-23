<template>
  <v-dialog v-model="visible" :title="dialogTitle" width="720px" append-to-body>
    <el-form v-if="needsLibrary" label-position="top" class="mb-4">
      <el-form-item label="存入资料库" required>
        <el-select
          v-model="targetLibraryId"
          class="w-full"
          placeholder="请先选择资料库，再添加文件"
          :disabled="hasPendingFiles"
          filterable
        >
          <el-option
            v-for="library in libraries"
            :key="library.libraryId"
            :label="library.name"
            :value="library.libraryId"
          />
        </el-select>
      </el-form-item>
      <p class="text-sm text-gray-600">
        文档将继承所选资料库的访问权限。添加文件后如需换库，请先移除未完成的文件。
      </p>
    </el-form>
    <el-alert
      v-if="incompatibleQueue"
      title="恢复的上传队列与所选资料库不一致，请先移除未完成文件，再重新添加。"
      type="warning"
      :closable="false"
      class="mb-4"
    />
    <input
      ref="inputRef"
      class="hidden"
      type="file"
      :accept="accept"
      :multiple="allowsMultipleFiles"
      @change="selectFiles"
    />
    <div
      class="mb-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
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
        class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500"
      >
        <lucide-cloud-upload class="h-7 w-7" />
      </div>
      <div class="text-base font-medium text-gray-700">
        {{ dropzoneTitle }}
      </div>
      <div class="mt-1 text-sm text-gray-600">
        {{ selectionHint }}
      </div>
      <div class="mt-2 text-sm text-gray-600">
        {{ typeSummary }}
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
      <el-button @click="visible = false">取消</el-button>
      <el-button
        v-if="canStartUpload"
        type="primary"
        :loading="uploadingBatch"
        :disabled="incompatibleQueue || (needsLibrary && !targetLibraryId)"
        @click="startUpload"
      >
        开始上传
      </el-button>
      <el-button v-else type="primary" @click="inputRef?.click()">
        选择文件
      </el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElOption,
  ElSelect,
} from 'element-plus';
import { VDialog } from '@repo/ui';

import { documentMaxFileSizeBytes } from './config';
import UploadQueue from './UploadQueue.vue';
import { useUploader } from './useUploader';
import { api, notify } from '@/utils';

import LucideCloudUpload from '~icons/lucide/cloud-upload';

import type { DocumentUploadResult, LibraryInfo } from '@/types';
import type { DocumentUploadTarget } from './types';

const props = defineProps<{
  /** GoldenRetriever 持久化空间的稳定用途键。 */
  instanceKey: string;
  /** 单次最多选择的文件数量；上传新版本时应设为 1。 */
  maxNumberOfFiles?: number;
}>();

const emit = defineEmits<{
  /** 单个文件完成验证并创建文档版本。 */
  uploaded: [result: DocumentUploadResult];
}>();

const visible = ref(false);
const inputRef = ref<HTMLInputElement>();
const targetDocumentId = ref<string>();
const targetLibraryId = ref<string>();
const libraries = ref<LibraryInfo[]>([]);
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
  maxNumberOfFiles: props.maxNumberOfFiles,
  getDocumentId() {
    return targetDocumentId.value;
  },
  getLibraryId() {
    return targetLibraryId.value;
  },
  onUploaded(file) {
    emit('uploaded', file);
  },
});
const needsLibrary = computed(() => !targetDocumentId.value);
const hasPendingFiles = computed(() =>
  items.value.some((item) => item.stage !== 'complete'),
);
const incompatibleQueue = computed(
  () =>
    needsLibrary.value &&
    items.value.some(
      (item) =>
        item.stage !== 'complete' && item.libraryId !== targetLibraryId.value,
    ),
);
const canStartUpload = computed(() =>
  items.value.some((item) => item.stage === 'waiting'),
);
const allowsMultipleFiles = computed(() => props.maxNumberOfFiles !== 1);
const selectionHint = computed(() => {
  if (allowsMultipleFiles.value) return '或点击选择，可一次选多个';
  return '或点击选择一个文件';
});
const typeSummary = `图片、PDF、Office、文本，单个不超过 ${Math.round(documentMaxFileSizeBytes / 1024 / 1024)} MiB`;
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

/**
 * 复核目标和管理资格后打开上传流程，优先恢复队列原来的资料库。
 * @param options 新文档的预选库，或已有文档的新版本目标。
 */
async function open(options?: DocumentUploadTarget) {
  await prepareContext(options?.documentId);
  targetDocumentId.value = options?.documentId;
  targetLibraryId.value = options?.libraryId;
  if (!options?.documentId) {
    const result = await api('/documents/library-list', {
      status: ['active'],
      limit: [0, 200],
    });
    libraries.value = result.list.filter(
      (library) => library.myRole === 'manager',
    );
    if (!libraries.value.length) {
      notify('warning', '暂无可上传的资料库，请先创建资料库或联系管理员授权');
      return;
    }
    const queuedLibraryId = items.value.find(
      (item) => item.stage !== 'complete',
    )?.libraryId;
    const queuedLibrary = libraries.value.find(
      (library) => library.libraryId === queuedLibraryId,
    );
    const current = libraries.value.find(
      (library) => library.libraryId === options?.libraryId,
    );
    if (queuedLibrary) {
      targetLibraryId.value = queuedLibrary.libraryId;
      if (options?.libraryId && options.libraryId !== queuedLibrary.libraryId) {
        notify(
          'info',
          `已恢复“${queuedLibrary.name}”的未完成上传，请完成或移除后再换库`,
        );
      }
    } else if (current) {
      targetLibraryId.value = current.libraryId;
    } else if (libraries.value.length === 1) {
      targetLibraryId.value = libraries.value[0]?.libraryId;
    } else {
      targetLibraryId.value = undefined;
    }
  }
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
  if (needsLibrary.value && !targetLibraryId.value) {
    notify('warning', '请先选择存入的资料库，再添加文件');
    return;
  }
  if (incompatibleQueue.value) {
    notify('warning', '请先移除与当前资料库不一致的未完成文件');
    return;
  }
  const errors = addFiles(files);
  if (errors.length) notify('error', errors.join('；'));
}

/** 再次核对上传队列所属资料库，避免恢复的文件被误认为将存入另一个库。 */
async function startUpload(): Promise<void> {
  if (incompatibleQueue.value || (needsLibrary.value && !targetLibraryId.value))
    return;
  await upload();
}

defineExpose({ open });
</script>
