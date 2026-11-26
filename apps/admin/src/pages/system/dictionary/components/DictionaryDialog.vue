<template>
  <v-dialog
    v-model="visible"
    :title="title"
    width="min(520px, 94vw)"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="88px"
      :disabled="saving"
    >
      <el-form-item label="字典名称" prop="name">
        <el-input v-model="form.name" maxlength="100" />
      </el-form-item>
      <el-form-item label="字典编码" prop="code">
        <div class="w-full">
          <el-input
            v-model="form.code"
            :disabled="!!form.id"
            maxlength="100"
            placeholder="例如：order_status"
          />
          <div class="mt-1 text-xs text-gray-600">
            小写字母、数字和下划线，创建后不可修改。
          </div>
        </div>
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
import { ElButton, ElForm, ElFormItem, ElInput, ElSwitch } from 'element-plus';
import { VDialog } from '@repo/ui';
import { api, notify } from '@/utils';
import type { FormInstance, FormRules } from 'element-plus';
import type { DictionaryInfo, DictionaryInput } from '@/types';

const emit = defineEmits<{ saved: [] }>();
const visible = ref(false);
const saving = ref(false);
const title = ref('新建字典');
const formRef = ref<FormInstance>();
const form = ref<DictionaryInput>({
  code: '',
  name: '',
  enabled: true,
  remark: '',
});
const rules: FormRules = {
  name: [
    {
      required: true,
      whitespace: true,
      message: '请输入字典名称',
      trigger: 'blur',
    },
  ],
  code: [
    { required: true, message: '请输入字典编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]*$/,
      message: '以小写字母开头，仅使用小写字母、数字和下划线',
      trigger: 'blur',
    },
  ],
};

/** 打开独立表单，编辑时保留不可修改的稳定编码。 */
async function open(row?: DictionaryInfo): Promise<void> {
  title.value = '新建字典';
  form.value = { code: '', name: '', enabled: true, remark: '' };
  if (row) {
    title.value = '编辑字典';
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
    await api('/sys/dictionary/save', { ...form.value });
    notify('success', '字典已保存');
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
defineExpose({ open });
</script>
