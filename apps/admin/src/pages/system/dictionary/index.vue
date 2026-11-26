<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="searchColumns"
        @submit="load(true)"
        @reset="load(true)"
      />
    </div>
    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex items-center justify-between gap-3">
        <strong>字典管理</strong>
        <el-button
          v-if="store.hasPermission('actions.dictionary.edit')"
          type="primary"
          @click="editor?.open()"
        >
          新建字典
        </el-button>
      </div>
      <el-alert
        v-if="failed"
        class="mb-3"
        title="字典加载失败，请重新查询。"
        type="error"
        :closable="false"
      />
      <v-table
        class="min-h-0 flex-1"
        :data="tableData"
        :rows="rows"
        :loading="loading"
        :props="{ emptyText: '暂无字典' }"
      >
        <template #enabled="{ row }">
          <el-tag v-if="row.enabled" type="success" size="small">启用</el-tag>
          <el-tag v-else type="info" size="small">停用</el-tag>
        </template>
        <template #actions="{ row }">
          <v-action-button-group
            :actions="getActions(row)"
            :max-visible="actionCount"
          />
        </template>
      </v-table>
      <page-component @update:model-value="load()" />
    </div>
    <dictionary-dialog ref="editor" @saved="load()" />
    <dictionary-items-drawer ref="items" />
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { ElAlert, ElButton, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';
import VActionButtonGroup from '@/components/action-button-group/VActionButtonGroup.vue';
import type { ActionButtonItem } from '@/components/action-button-group/types';
import { useStore } from '@/models';
import { api, confirm, notify } from '@/utils';
import DictionaryDialog from './components/DictionaryDialog.vue';
import DictionaryItemsDrawer from './components/DictionaryItemsDrawer.vue';
import { dictionaryQuery, dictionaryRows, searchColumns } from './utils';
import type { DictionaryInfo } from '@/types';
import type { DictionarySearchForm } from './utils';

const store = useStore();
const editor = ref<InstanceType<typeof DictionaryDialog>>();
const items = ref<InstanceType<typeof DictionaryItemsDrawer>>();
const searchForm = ref<DictionarySearchForm>({});
const dictionaries = ref<DictionaryInfo[]>([]);
const tableData = computed(() =>
  dictionaries.value.map((item) => ({ ...item })),
);
const loading = ref(false);
const failed = ref(false);
const busy = ref(false);
const { pageComponent, pageRange, setPageData } = usePage({
  page: { size: 20 },
});
const compact = useMediaQuery('(max-width: 640px)');
const actionCount = computed(() => {
  if (compact.value) {
    return 1;
  }
  return 3;
});
const rows = computed(() => {
  if (!compact.value) {
    return dictionaryRows;
  }
  return dictionaryRows.map((column) => {
    if (column.value === 'actions') {
      return { ...column, width: 130 };
    }
    return column;
  });
});
watch(
  compact,
  (value) => {
    if (value) {
      setPageData({
        layout: ['total', 'prev', 'pager', 'next'],
        pagerCount: 5,
      });
      return;
    }
    setPageData({
      layout: ['slot', 'sizes', 'prev', 'pager', 'next', 'jumper'],
      pagerCount: 5,
    });
  },
  { immediate: true },
);
let sequence = 0;
let filter: DictionarySearchForm = {};

/** 窄屏保留字典项入口，其余授权操作收进更多菜单。 */
function getActions(row: DictionaryInfo): ActionButtonItem[] {
  return [
    { key: 'items', label: '字典项', handler: () => items.value?.open(row) },
    {
      key: 'edit',
      label: '编辑',
      isShow: store.hasPermission('actions.dictionary.edit'),
      handler: () => editor.value?.open(row),
    },
    {
      key: 'remove',
      label: '删除',
      type: 'danger',
      isShow: store.hasPermission('actions.dictionary.delete'),
      disabled: busy.value,
      handler: () => remove(row),
    },
  ];
}

async function load(reset = false): Promise<void> {
  if (reset) {
    filter = { ...searchForm.value };
    setPageData({ current: 1 });
  }
  const current = ++sequence;
  loading.value = true;
  try {
    const result = await api('/sys/dictionary/list', {
      ...dictionaryQuery(filter),
      limit: pageRange.value,
    });
    if (current !== sequence) {
      return;
    }
    dictionaries.value = result.list;
    setPageData({ total: result.count });
    failed.value = false;
  } catch {
    if (current === sequence) {
      failed.value = true;
    }
  } finally {
    if (current === sequence) {
      loading.value = false;
    }
  }
}

async function remove(row: DictionaryInfo): Promise<void> {
  await confirm({
    title: `删除字典“${row.name}”？`,
    async confirmCallback() {
      busy.value = true;
      try {
        await api('/sys/dictionary/remove', { id: row.id });
        notify('success', '字典已删除');
        await load(true);
      } finally {
        busy.value = false;
      }
    },
  });
}
onMounted(() => {
  void load();
});
onBeforeUnmount(() => {
  sequence += 1;
});
</script>
