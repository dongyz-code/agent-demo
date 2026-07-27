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
import { ref } from 'vue';
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
// 用 ref 而非 reactive：VSchemaForm 经 update:modelValue 回写整个对象，
// v-model 编译为 form = $event，const reactive 无法重赋值会导致输入写不回；ref 走 .value 重赋值即可。
const form = ref<DatasetForm>({ name: '', description: '' });

const columns: SchemaFormColumn<DatasetForm>[] = [
  { dataIndex: 'name', title: '名称', valueType: 'text', formItemProps: { required: true } },
  { dataIndex: 'description', title: '说明', valueType: 'textarea' },
];

/** 打开新建或编辑弹窗。 */
function open(dataset?: RagDatasetInfo) {
  form.value = {
    datasetId: dataset?.datasetId,
    name: dataset?.name ?? '',
    description: dataset?.description ?? '',
  };
  visible.value = true;
}

/** 提交知识库基础信息。 */
async function submit() {
  if (!form.value.name.trim()) return;
  submitting.value = true;
  try {
    if (form.value.datasetId) {
      await api('/documents/dataset-update', {
        datasetId: form.value.datasetId,
        update: { name: form.value.name, description: form.value.description },
      });
    } else {
      await api('/documents/dataset-create', {
        name: form.value.name,
        description: form.value.description,
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
