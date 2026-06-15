<template>
  <el-button type="primary" @click="addTask">添加任务</el-button>
  <v-dialog v-model="visible" title="添加任务" width="80%">
    <!-- <el-select
      :model-value="form.key"
      @update:model-value="keyUpdate"
      placeholder="请选择任务类型"
    >
      <el-option
        v-for="item in props.types"
        :key="item.key"
        :label="item.name"
        :value="item.key"
      />
    </el-select> -->

    <el-radio-group
      :model-value="form.key"
      @update:model-value="keyUpdate"
      :options="props.types.filter((item) => item.allowFrontendSubmit)"
      :props="{ label: 'name', value: 'key' }"
    />

    <div
      v-if="activeType?.argsMode"
      class="mt-4 space-y-4 rounded border bg-white p-4 shadow-sm"
    >
      <v-args
        ref="argsRef"
        :args="activeType.argsMode"
        v-model="form.args"
      ></v-args>

      <pre class="border-t pt-4">{{ JSON.stringify(form.args, null, 2) }}</pre>
    </div>

    <template #footer>
      <div class="flex items-center justify-center">
        <el-button
          type="danger"
          @click="visible = false"
          :disabled="createTaskLoading"
          >取消</el-button
        >
        <el-button
          :loading="createTaskLoading"
          type="primary"
          @click="createTask"
          >确定</el-button
        >
      </div>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import VArgs from './Args.vue';

import { computed, ref, shallowRef, useTemplateRef } from 'vue';
import { notify } from '@/plugins/notify';
import { api } from '@/api';
import { ElButton, ElRadioGroup } from 'element-plus';
import { VDialog, loadingFunc } from '@repo/ui';

import type { CreateTaskForm, TaskType } from '../type';

const props = defineProps<{
  types: TaskType[];
}>();

const emits = defineEmits<{
  create: [];
}>();

/** 创建任务 */
const visible = shallowRef(false);

const form = ref<CreateTaskForm>({
  key: '',
  args: [],
  trigger_method: 'manual',
});

const activeType = computed(() =>
  props.types.find((self) => self.key === form.value.key),
);

const argsRef = useTemplateRef('argsRef');

function keyUpdate(key: any) {
  form.value.key = key;
  form.value.args = [];
}

function addTask() {
  keyUpdate('');
  visible.value = true;
}

/** 创建任务 */
const { createTask, createTaskLoading } = loadingFunc({
  funcs: {
    async createTask() {
      const { key, args = [] } = form.value;
      const errors = argsRef.value?.check();
      if (errors?.length) {
        notify('error', '请完整填写');
        return;
      }

      if (!key) {
        notify('error', '请选择任务类型');
        return;
      }

      try {
        await api('/sys/task/add', {
          key,
          args,
          trigger_method: 'manual',
        });
        notify('success', '提交任务成功');
        emits('create');
        visible.value = false;
      } catch (error) {
        notify('error', '非法参数');
      }
    },
  },
});
</script>
