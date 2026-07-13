<template>
  <v-dialog v-model="visible" title="RAG 接入" width="520px">
    <div v-if="file" class="space-y-4">
      <div>
        <div class="text-sm text-gray-500">文件</div>
        <div>{{ file.filename }}</div>
      </div>
      <div>
        <div class="mb-2 text-sm text-gray-500">目标知识库</div>
        <el-select v-model="datasetId" class="w-full" placeholder="请选择目标知识库">
          <el-option
            v-for="dataset in datasets"
            :key="dataset.datasetId"
            :label="dataset.name"
            :value="dataset.datasetId"
          />
        </el-select>
      </div>
      <div class="text-sm text-gray-500">
        本次任务会依次执行内容读取、解析、整理、切分和知识库接入。
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!datasetId"
        @click="submit"
      >
        创建任务
      </el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { ElButton, ElOption, ElSelect } from 'element-plus';
import { VDialog } from '@repo/ui';

import { api, notify } from '@/utils';

import type { FileProcessingTaskInfo, ManagedFileInfo } from '@/types';

const emit = defineEmits<{
  /** 文件处理任务创建成功。 */
  submitted: [task: FileProcessingTaskInfo];
}>();

const visible = ref(false);
const submitting = ref(false);
const file = shallowRef<ManagedFileInfo>();
const datasetId = ref<string>();
const datasets = ref<{ datasetId: string; name: string }[]>([]);

/** 打开指定文件的 RAG 接入配置。 */
async function open(nextFile: ManagedFileInfo) {
  const options = await api('/documents/file-processing-options', {});
  file.value = nextFile;
  datasets.value = options.datasets;
  datasetId.value =
    nextFile.latestTask?.datasetId ?? options.datasets[0]?.datasetId;
  visible.value = true;
}

/** 创建一次新的文件处理任务。 */
async function submit() {
  if (!file.value || !datasetId.value) return;
  submitting.value = true;
  try {
    const task = await api('/documents/processing-create', {
      fileId: file.value.fileId,
      datasetId: datasetId.value,
    });
    notify('success', `已创建第 ${task.executionNo} 次处理任务`);
    visible.value = false;
    emit('submitted', task);
  } finally {
    submitting.value = false;
  }
}

defineExpose({ open });
</script>

