<template>
  <v-dialog
    v-model="visible"
    :title="form.libraryId ? '编辑资料库' : '新建资料库'"
    width="520px"
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
      @submit.prevent="submit"
    >
      <el-form-item label="名称" prop="name">
        <el-input
          v-model="form.name"
          maxlength="255"
          show-word-limit
          placeholder="例如：产品手册、项目资料"
        />
      </el-form-item>
      <el-form-item label="说明">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="说明用途和适合存放的文档（选填）"
        />
      </el-form-item>
      <p class="ml-[88px] text-sm text-gray-600">
        {{
          form.visibility === 'published'
            ? '所有登录用户均可查看、下载和检索文档，管理操作仍需单独授权。'
            : '仅授权的用户和用户组可以访问。创建后可在“访问权限”中添加成员。'
        }}
      </p>
      <el-form-item label="访问范围">
        <el-radio-group v-model="form.visibility">
          <el-radio value="restricted">指定成员</el-radio>
          <el-radio value="published">全员可使用</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit"
        >保存</el-button
      >
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElRadio,
  ElRadioGroup,
} from 'element-plus';
import { VDialog } from '@repo/ui';

import { api, notify } from '@/utils';

import type { LibraryInfo, LibraryVisibility } from '@/types';
import type { FormInstance, FormRules } from 'element-plus';

const emit = defineEmits<{
  /** 保存成功后刷新列表。 */
  saved: [];
}>();

const visible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = ref({
  libraryId: '',
  name: '',
  description: '',
  visibility: 'restricted' as LibraryVisibility,
});
/** 名称在提交前去掉首尾空格，避免仅空白的输入进入保存流程。 */
const rules: FormRules = {
  name: [
    {
      required: true,
      whitespace: true,
      message: '请输入资料库名称',
      trigger: 'blur',
    },
  ],
};

/**
 * 重置表单后打开新建或编辑弹窗。
 * @param library 编辑目标；不传时创建资料库。
 */
function open(library?: LibraryInfo) {
  if (saving.value) return;
  formRef.value?.clearValidate();
  form.value = {
    libraryId: library?.libraryId ?? '',
    name: library?.name ?? '',
    description: library?.description ?? '',
    visibility: library?.visibility ?? 'restricted',
  };
  visible.value = true;
}

/** 验证必填名称并保存；请求完成前禁止重复提交和关闭弹窗。 */
async function submit() {
  if (saving.value) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    await save();
  } catch {
    // 错误由请求层展示，表单保留当前输入以供重试。
  } finally {
    saving.value = false;
  }
}

/** 调用新建或更新接口。 */
async function save() {
  if (form.value.libraryId) {
    await api('/documents/library-update', {
      libraryId: form.value.libraryId,
      name: form.value.name.trim(),
      description: form.value.description,
      visibility: form.value.visibility,
    });
  } else {
    await api('/documents/library-create', {
      name: form.value.name.trim(),
      description: form.value.description || undefined,
      visibility: form.value.visibility,
    });
  }
  notify('success', '资料库已保存');
  visible.value = false;
  emit('saved');
}

defineExpose({ open });
</script>
