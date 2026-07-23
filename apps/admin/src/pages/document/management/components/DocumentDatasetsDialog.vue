<template>
  <v-dialog v-model="visible" title="管理文档知识库" width="560px">
    <div v-if="document" class="space-y-3">
      <div>
        <div class="text-sm text-gray-500">文档</div>
        <div>{{ document.name }}</div>
      </div>
      <el-select
        v-model="datasetIds"
        class="w-full"
        multiple
        filterable
        collapse-tags
        collapse-tags-tooltip
        placeholder="请选择知识库"
      >
        <el-option
          v-for="dataset in datasets"
          :key="dataset.datasetId"
          :label="dataset.name"
          :value="dataset.datasetId"
        />
      </el-select>
      <div class="text-sm text-gray-500">
        新加入的知识库会处理当前文档版本；移除后旧版本立即停止参与该知识库检索。
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { ElButton, ElOption, ElSelect } from 'element-plus';
import { VDialog } from '@repo/ui';

import { api, notify } from '@/utils';

import type { DocumentInfo, RagDatasetInfo } from '@/types';

const emit = defineEmits<{
  /** 知识库关系保存完成。 */
  changed: [];
}>();

const visible = ref(false);
const submitting = ref(false);
const document = shallowRef<DocumentInfo>();
const datasets = shallowRef<RagDatasetInfo[]>([]);
const datasetIds = ref<string[]>([]);

/** 打开文档知识库全量选择弹窗。 */
async function open(nextDocument: DocumentInfo) {
  const result = await api('/documents/dataset-list', {
    status: ['active'],
    limit: [0, 1000],
  });
  document.value = nextDocument;
  datasets.value = result.list;
  datasetIds.value = nextDocument.datasets.map((dataset) => dataset.datasetId);
  visible.value = true;
}

/** 用当前选择替换文档知识库关系。 */
async function submit() {
  if (!document.value) return;
  submitting.value = true;
  try {
    await api('/documents/dataset-document-update', {
      documentId: document.value.documentId,
      datasetIds: datasetIds.value,
    });
    notify('success', '文档知识库关系已更新');
    visible.value = false;
    emit('changed');
  } finally {
    submitting.value = false;
  }
}

defineExpose({ open });
</script>
