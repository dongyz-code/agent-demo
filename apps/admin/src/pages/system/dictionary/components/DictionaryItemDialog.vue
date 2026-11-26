<template>
  <v-dialog
    v-model="visible"
    :title="title"
    width="min(520px, 94vw)"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    append-to-body
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="72px"
      :disabled="saving"
    >
      <el-form-item label="标签" prop="label">
        <el-input
          v-model="form.label"
          maxlength="100"
          placeholder="例如：待付款"
        />
      </el-form-item>
      <el-form-item label="字典值" prop="value">
        <el-input
          v-model="form.value"
          maxlength="100"
          placeholder="例如：pending"
        />
      </el-form-item>
      <el-form-item label="排序" prop="sort">
        <el-input-number
          v-model="form.sort"
          :min="0"
          :max="2147483647"
          :precision="0"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-switch
          v-model="form.enabled"
          active-text="启用"
          inactive-text="停用"
        />
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          maxlength="500"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </v-dialog>
</template>
<script setup lang="ts">
import { nextTick, ref } from 'vue';
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElSwitch,
} from 'element-plus';
import { VDialog } from '@repo/ui';
import { api, notify } from '@/utils';
import type { FormInstance, FormRules } from 'element-plus';
import type { DictionaryItemInfo, DictionaryItemInput } from '@/types';

const emit = defineEmits<{ saved: [] }>();
const visible = ref(false);
const saving = ref(false);
const title = ref('新建字典项');
const formRef = ref<FormInstance>();
const form = ref<DictionaryItemInput>({
  dictionaryId: '',
  label: '',
  value: '',
  sort: 0,
  enabled: true,
  remark: '',
});
const rules: FormRules = {
  label: [
    {
      required: true,
      whitespace: true,
      message: '请输入标签',
      trigger: 'blur',
    },
  ],
  value: [
    {
      required: true,
      whitespace: true,
      message: '请输入字典值',
      trigger: 'blur',
    },
  ],
  sort: [
    {
      required: true,
      type: 'number',
      message: '请输入排序值',
      trigger: 'blur',
    },
  ],
};

/** 在当前类型下新建或编辑，字典项不能移动到其他类型。 */
async function open(
  dictionaryId: string,
  row?: DictionaryItemInfo,
): Promise<void> {
  title.value = '新建字典项';
  form.value = {
    dictionaryId,
    label: '',
    value: '',
    sort: 0,
    enabled: true,
    remark: '',
  };
  if (row) {
    title.value = '编辑字典项';
    form.value = { ...row };
  }
  visible.value = true;
  await nextTick();
  formRef.value?.clearValidate();
}
async function save(): Promise<void> {
  if (saving.value || !(await formRef.value?.validate().catch(() => false))) {
    return;
  }
  saving.value = true;
  try {
    await api('/sys/dictionary/item-save', { ...form.value });
    notify('success', '字典项已保存');
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
defineExpose({ open });
</script>
