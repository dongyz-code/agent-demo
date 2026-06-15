<template>
  <div class="h-body relative flex flex-col overflow-hidden p-2">
    <div
      ref="tableEle"
      v-loading="getIdsLoading"
      class="h-full rounded-md bg-white px-2"
    >
      <div class="flex items-center justify-between">
        <page-component></page-component>
        <div class="flex shrink-0 items-center gap-2">
          <el-button type="primary" @click="openDeployRequirement"
            >后端服务部署要求</el-button
          >
          <el-button type="primary" @click="openEdit">
            <template #icon>
              <IconParkOutlinePlus />
            </template>
            创建应用
          </el-button>
        </div>
      </div>
      <v-table
        v-if="height && data.length"
        :data="data"
        :max-height="tableHeight"
      ></v-table>

      <v-edit></v-edit>
      <v-upload></v-upload>
      <v-history></v-history>
      <v-deploy-requirement ref="deployRequirementRef"></v-deploy-requirement>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useTemplateRef } from 'vue';
import { loadingFunc, usePage } from '@repo/ui';
import { httpCache } from '@/cache';
import { api } from '@/api';
import { useElementSize } from '@vueuse/core';
import { aiAppEvent } from './event';

import IconParkOutlinePlus from '~icons/icon-park-outline/plus';

import VTable from './components/Table.vue';
import VEdit from './components/Edit.vue';
import VUpload from './components/Upload.vue';
import VHistory from './components/History.vue';
import VDeployRequirement from './components/DeployRequirement.vue';

import { ElButton } from 'element-plus';

import type { Form } from './type';

const form = ref<Form>({});

const deployRequirementRef = useTemplateRef<
  InstanceType<typeof VDeployRequirement>
>('deployRequirementRef');

function openDeployRequirement() {
  deployRequirementRef.value?.open();
}

const { setPageData, pageRange, pageComponent } = usePage({
  page: {
    size: 100,
  },
});

const { height } = useElementSize(useTemplateRef('tableEle'));
const tableHeight = computed(() => {
  return Math.floor(height.value) - 56 + 'px';
});

const ids = shallowRef<string[]>([]);

const data = computed(() => {
  const map = httpCache.aiAppDetail.mapping.value;
  return ids.value.filter((id) => map[id]).map((id) => map[id]!);
});

const { getIds, getIdsLoading } = loadingFunc({
  funcs: {
    async getIds(withCount?: boolean) {
      if (withCount) {
        setPageData({ current: 1 });
      }

      const resp = await api('/main/app-ids', {
        form: form.value,
        limit: pageRange.value,
        withCount,
      });

      if (withCount) {
        setPageData({ total: resp.count });
      }

      if (resp.ids.length) {
        const detail = await httpCache.aiAppDetail.get({ ids: resp.ids });
        await httpCache.user.get({
          ids: detail.map((item) => item.create_user_id),
        });
      }

      ids.value = resp.ids;
    },
  },
});

onMounted(async () => {
  await getIds(true);
});

function openEdit() {
  aiAppEvent.dispatch('edit', {
    role: 'create',
    async callback() {
      await getIds(true);
    },
  });
}
</script>
