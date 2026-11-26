<template>
  <el-drawer
    v-model="visible"
    title="字典项"
    size="min(960px, 100vw)"
    @closed="sequence += 1"
  >
    <div class="flex h-full min-h-0 flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>{{ dictionary?.name }}</strong>
          <span class="ml-3 text-sm text-gray-600">{{ dictionary?.code }}</span>
        </div>
        <el-button
          v-if="dictionary && store.hasPermission('actions.dictionary.edit')"
          type="primary"
          @click="editor?.open(dictionary.id)"
        >
          新建字典项
        </el-button>
      </div>
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="searchColumns"
        @submit="load(true)"
        @reset="load(true)"
      />
      <el-alert
        v-if="failed"
        title="字典项加载失败，请重新查询。"
        type="error"
        :closable="false"
      />
      <v-table
        class="min-h-0 flex-1"
        :data="tableData"
        :rows="itemRows"
        :loading="loading"
        :props="{ emptyText: '暂无字典项' }"
      >
        <template #enabled="{ row }">
          <el-tag v-if="row.enabled" type="success" size="small">启用</el-tag>
          <el-tag v-else type="info" size="small">停用</el-tag>
        </template>
        <template #actions="{ row }">
          <el-button
            v-if="store.hasPermission('actions.dictionary.edit')"
            link
            @click="editor?.open(row.dictionaryId, row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="store.hasPermission('actions.dictionary.delete')"
            link
            type="danger"
            :disabled="busy"
            @click="remove(row)"
          >
            删除
          </el-button>
        </template>
      </v-table>
      <page-component @update:model-value="load()" />
    </div>
    <dictionary-item-dialog ref="editor" @saved="load()" />
  </el-drawer>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElAlert, ElButton, ElDrawer, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';
import { useStore } from '@/models';
import { api, confirm, notify } from '@/utils';
import DictionaryItemDialog from './DictionaryItemDialog.vue';
import { dictionaryQuery, itemRows, searchColumns } from '../utils';
import type { DictionaryInfo, DictionaryItemInfo } from '@/types';
import type { DictionarySearchForm } from '../utils';

const store = useStore();
const editor = ref<InstanceType<typeof DictionaryItemDialog>>();
const visible = ref(false);
const dictionary = ref<DictionaryInfo>();
const searchForm = ref<DictionarySearchForm>({});
const entries = ref<DictionaryItemInfo[]>([]);
const tableData = computed(() => entries.value.map((item) => ({ ...item })));
const loading = ref(false);
const failed = ref(false);
const busy = ref(false);
const { pageComponent, pageRange, setPageData } = usePage({
  page: { size: 20, layout: ['total', 'prev', 'pager', 'next'], pagerCount: 5 },
});
let sequence = 0;
let filter: DictionarySearchForm = {};

/** 切换字典时清空旧列表与筛选，旧响应不能覆盖新字典。 */
function open(row: DictionaryInfo): void {
  dictionary.value = row;
  entries.value = [];
  searchForm.value = {};
  visible.value = true;
  void load(true);
}
async function load(reset = false): Promise<void> {
  if (!dictionary.value || !visible.value) {
    return;
  }
  if (reset) {
    filter = { ...searchForm.value };
    setPageData({ current: 1 });
  }
  const current = ++sequence;
  loading.value = true;
  try {
    const result = await api('/sys/dictionary/items', {
      ...dictionaryQuery(filter),
      dictionaryId: dictionary.value.id,
      limit: pageRange.value,
    });
    if (current !== sequence) {
      return;
    }
    entries.value = result.list;
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
async function remove(row: DictionaryItemInfo): Promise<void> {
  await confirm({
    title: `删除字典项“${row.label}”？`,
    async confirmCallback() {
      busy.value = true;
      try {
        await api('/sys/dictionary/item-remove', {
          id: row.id,
          dictionaryId: row.dictionaryId,
        });
        notify('success', '字典项已删除');
        await load(true);
      } finally {
        busy.value = false;
      }
    },
  });
}
defineExpose({ open });
</script>
