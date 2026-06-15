<template>
  <v-dialog v-model="visible" title="编辑" width="50%">
    <div class="space-y-4">
      <el-input v-model="form.name" placeholder="名称" />
      <el-input
        v-model="form.domain"
        :placeholder="`域名（${domainRegexError}）`"
      />
      <el-input
        v-model="form.desc"
        type="textarea"
        :autosize="{ minRows: 3, maxRows: 3 }"
        placeholder="简介(可选)"
      />
    </div>

    <template #footer>
      <div class="flex items-center justify-center gap-2">
        <el-button
          type="danger"
          @click="visible = false"
          :disabled="handleConfirmLoading"
          >取消</el-button
        >
        <el-button
          type="primary"
          @click="handleConfirm"
          :loading="handleConfirmLoading"
          >确认</el-button
        >
      </div>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { loadingFunc, VDialog } from '@repo/ui';
import { aiAppEvent } from '../event';
import { notify } from '@/plugins/notify';
import { api } from '@/api';

import { ElButton, ElInput } from 'element-plus';

import type { AiAppEvent } from '../event';

type Form = Extract<AiAppEvent['edit'], { role: 'update' }>['form'];

const baseForm: Form = {
  name: '',
  desc: '',
  domain: '',
};

const domainRegex = /[^\w-]/;
const domainRegexError = '域名只能包含字母、数字、下划线和短横线';

const visible = ref(false);

const info = shallowRef<AiAppEvent['edit']>();

const form = ref<Form>({ ...baseForm });

aiAppEvent.add('edit', ({ detail }) => {
  info.value = detail;

  if (detail.role === 'update') {
    form.value = { ...detail.form };
  } else {
    form.value = { ...baseForm };
  }
  visible.value = true;
});

const { handleConfirm, handleConfirmLoading } = loadingFunc({
  funcs: {
    async handleConfirm() {
      let { name, desc, domain } = form.value;
      name = name.trim();
      desc = (desc ?? '').trim();
      domain = domain.trim();

      if (!name || !domain) {
        notify('error', '请完整填写');
        return;
      }

      if (domain.match(domainRegex)) {
        notify('error', domainRegexError);
        return;
      }

      const detail = info.value!;

      if (detail.role === 'create') {
        await api('/main/app-create', { name, desc, domain });
      } else if (detail.role === 'update') {
        await api('/main/app-update', {
          id: detail.id,
          update: { name, desc, domain },
        });
      }

      info.value?.callback?.({ name, desc, domain });

      notify('success', '操作成功');
      visible.value = false;
    },
  },
});
</script>
