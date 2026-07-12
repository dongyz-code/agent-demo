<template>
  <v-dialog v-model="visible" :title="form.datasetId ? '编辑知识库' : '新建知识库'">
    <v-schema-form v-model="form" :columns="columns" />
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElButton } from 'element-plus';
import { VDialog, VSchemaForm } from '@repo/ui';

import { api } from '@/utils';

import type { RagDatasetInfo } from '@/types';
import type { SchemaFormColumn } from '@repo/ui';

type DatasetForm = {
  /** 编辑时的知识库标识。 */
  datasetId?: string;
  /** 知识库名称。 */
  name: string;
  /** 知识库说明。 */
  description: string;
};

const emit = defineEmits<{ /** 保存成功。 */ saved: [] }>();
const visible = ref(false);
const submitting = ref(false);
const form = reactive<DatasetForm>({ name: '', description: '' });

const columns: SchemaFormColumn<DatasetForm>[] = [
  { dataIndex: 'name', title: '名称', valueType: 'text', formItemProps: { required: true } },
  { dataIndex: 'description', title: '说明', valueType: 'textarea' },
];

/** 打开新建或编辑弹窗。 */
function open(dataset?: RagDatasetInfo) {
  form.datasetId = dataset?.datasetId;
  form.name = dataset?.name ?? '';
  form.description = dataset?.description ?? '';
  visible.value = true;
}

/** 提交知识库基础信息。 */
async function submit() {
  if (!form.name.trim()) return;
  submitting.value = true;
  try {
    if (form.datasetId) {
      await api('/rag/dataset/update', {
        datasetId: form.datasetId,
        update: { name: form.name, description: form.description },
      });
    } else {
      await api('/rag/dataset/create', {
        name: form.name,
        description: form.description,
      });
    }
    visible.value = false;
    emit('saved');
  } finally {
    submitting.value = false;
  }
}

defineExpose({ open });
</script>
