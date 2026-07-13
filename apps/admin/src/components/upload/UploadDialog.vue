<template>
  <v-dialog v-model="visible" title="上传文件" width="720px">
    <input ref="inputRef" class="hidden" type="file" multiple @change="selectFiles" />
    <div v-if="enableRag" class="mb-4 rounded border border-gray-200 p-3">
      <div class="flex items-center justify-between">
        <span>上传后进入 RAG</span>
        <el-switch v-model="enterRag" />
      </div>
      <el-select
        v-if="enterRag"
        v-model="datasetId"
        class="mt-3 w-full"
        clearable
        placeholder="请选择目标知识库"
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
        :disabled="!items.length || (enableRag && enterRag && !datasetId)"
        @click="upload"
      >
        开始上传
      </el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElButton, ElOption, ElSelect, ElSwitch } from 'element-plus';
import { VDialog } from '@repo/ui';

import UploadQueue from './UploadQueue.vue';
import { useUploader } from './useUploader';
import { api } from '@/utils';

import type { StoredFileInfo, UploadPolicyKey } from '@/types';

const props = withDefaults(defineProps<{
  /** 服务端上传策略。 */
  policyKey?: UploadPolicyKey;
  /** 是否展示上传后进入 RAG 的业务选项。 */
  enableRag?: boolean;
}>(), {
  policyKey: 'default-attachment',
  enableRag: false,
});

const emit = defineEmits<{
  /** 单个文件完成服务端验证。 */
  uploaded: [file: StoredFileInfo];
}>();

const visible = ref(false);
const inputRef = ref<HTMLInputElement>();
const enterRag = ref(false);
const datasetId = ref<string>();
const datasets = ref<{ datasetId: string; name: string }[]>([]);
const { items, addFiles, upload, pauseResume, remove, retry, clearCompleted } = useUploader({
  policyKey: props.policyKey,
  getProcessingIntent() {
    return props.enableRag
      ? { enterRag: enterRag.value, datasetId: datasetId.value }
      : { enterRag: false };
  },
  onUploaded(file) {
    emit('uploaded', file);
  },
});

watch(visible, (nextVisible) => {
  if (!nextVisible) clearCompleted();
});

/** 打开上传弹窗。 */
async function open() {
  if (props.enableRag) {
    const options = await api('/documents/file-processing-options', {});
    datasets.value = options.datasets;
    enterRag.value = options.defaultEnterRag;
    datasetId.value = options.datasets[0]?.datasetId;
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
