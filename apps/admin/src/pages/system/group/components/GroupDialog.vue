<template>
  <v-dialog
    v-model="visible"
    :title="form.userGroupId ? '编辑用户组' : '新建用户组'"
  >
    <el-form label-width="72px">
      <el-form-item label="名称">
        <el-input v-model="form.name" maxlength="255" />
      </el-form-item>
      <el-form-item label="说明">
        <el-input v-model="form.description" type="textarea" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="submit">保存</el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElButton, ElForm, ElFormItem, ElInput } from 'element-plus';
import { VDialog } from '@repo/ui';

import { api, notify } from '@/utils';

import type { UserGroupInfo } from '@/types';

const emit = defineEmits<{ saved: [] }>();
const visible = ref(false);
const form = ref({ userGroupId: '', name: '', description: '' });

/** 打开新建或编辑弹窗。 */
function open(group?: UserGroupInfo) {
  form.value = {
    userGroupId: group?.userGroupId ?? '',
    name: group?.name ?? '',
    description: group?.description ?? '',
  };
  visible.value = true;
}

/** 保存用户组基础信息。 */
async function submit() {
  if (form.value.userGroupId) {
    await api('/sys/group/update', {
      userGroupId: form.value.userGroupId,
      name: form.value.name,
      description: form.value.description,
    });
  } else {
    await api('/sys/group/create', {
      name: form.value.name,
      description: form.value.description || undefined,
    });
  }
  notify('success', '用户组已保存');
  visible.value = false;
  emit('saved');
}

defineExpose({ open });
</script>
