<template>
  <v-dialog v-model="visible" title="上传文件" width="720px">
    <input ref="inputRef" class="hidden" type="file" multiple @change="selectFiles" />
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
      <el-button type="primary" :disabled="!items.length" @click="upload">开始上传</el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElButton } from 'element-plus';
import { VDialog } from '@repo/ui';

import UploadQueue from './UploadQueue.vue';
import { useUploader } from './useUploader';

import type { StoredFileInfo, UploadPolicyKey } from '@/types';

const props = withDefaults(defineProps<{
  /** 服务端上传策略。 */
  policyKey?: UploadPolicyKey;
}>(), {
  policyKey: 'default-attachment',
});

const emit = defineEmits<{
  /** 单个文件完成服务端验证。 */
  uploaded: [file: StoredFileInfo];
}>();

const visible = ref(false);
const inputRef = ref<HTMLInputElement>();
const { items, addFiles, upload, pauseResume, remove, retry, clearCompleted } = useUploader({
  policyKey: props.policyKey,
  onUploaded(file) {
    emit('uploaded', file);
  },
});

watch(visible, (nextVisible) => {
  if (!nextVisible) clearCompleted();
});

/** 打开上传弹窗。 */
function open() {
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
