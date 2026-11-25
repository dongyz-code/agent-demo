<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="searchColumns"
        :initial-values="initialValues"
        :disabled="clearing"
        @reset="load(true)"
        @submit="load(true)"
      />
    </div>
    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <strong>缓存列表</strong>
        <el-button
          v-if="store.hasPermission('actions.cache.clear')"
          type="danger"
          :loading="clearing"
          :disabled="
            loading || failed || !selected || searchForm.name !== selected.name
          "
          @click="clearSpace"
        >
          清空缓存
        </el-button>
      </div>
      <el-alert
        v-if="failed"
        class="mb-3"
        type="error"
        :closable="false"
        title="缓存加载失败，请重试。"
      />
      <el-alert
        v-if="clearing && clearProgress"
        class="mb-3"
        type="info"
        :closable="false"
        :title="clearProgress"
      />
      <v-table
        class="min-h-0 flex-1"
        :data="tableData"
        :rows="cacheRows"
        :loading="loading"
        :props="{ emptyText: '暂无缓存' }"
      >
        <template #ttl="{ row }">{{ ttlText(row.ttl) }}</template>
        <template #actions="{ row }">
          <el-button
            v-if="
              selected?.inspectable && store.hasPermission('actions.cache.view')
            "
            link
            :disabled="loading || failed || clearing"
            @click="valueDialog?.open(selected.name, row.key)"
          >
            查看
          </el-button>
          <el-button
            v-if="store.hasPermission('actions.cache.clear')"
            link
            type="danger"
            :disabled="loading || failed || clearing"
            @click="clearKey(row.key)"
          >
            删除
          </el-button>
        </template>
      </v-table>
      <div v-if="cursor !== '0'" class="mt-4 flex justify-end">
        <el-button
          :loading="loading"
          :disabled="clearing || entries.length >= 1000"
          @click="load(false)"
        >
          加载更多
        </el-button>
      </div>
      <p v-if="entries.length >= 1000" class="mt-2 text-sm text-gray-500">
        最多显示 1000 项，请缩小查询范围。
      </p>
    </div>
    <cache-value-dialog ref="valueDialog" />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { ElAlert, ElButton } from 'element-plus';
import { VSchemaForm, VTable } from '@repo/ui';

import { useStore } from '@/models';
import { api, confirm, notify } from '@/utils';
import CacheValueDialog from './components/CacheValueDialog.vue';
import { cacheRows, getCacheSearchColumns, ttlText } from '../utils';

import type { CacheEntryInfo, CacheInfo } from '@/types';
import type { CacheSearchForm } from '../types';

const store = useStore();
const searchForm = ref<CacheSearchForm>({});
const spaces = shallowRef<CacheInfo[]>([]);
const searchColumns = computed(() => getCacheSearchColumns(spaces.value));
const initialValues = computed(() => ({ name: spaces.value[0]?.name }));
const selected = shallowRef<CacheInfo>();
const entries = shallowRef<CacheEntryInfo[]>([]);
const tableData = computed(() => entries.value.map((entry) => ({ ...entry })));
const loading = ref(false);
const failed = ref(false);
const clearing = ref(false);
const clearProgress = ref('');
const cursor = ref('0');
const valueDialog = ref<InstanceType<typeof CacheValueDialog>>();
/** 翻页沿用已提交的关键字，未提交的表单不影响当前列表。 */
let keyword = '';
/** 页面切换和后发请求使旧响应失效。 */
let sequence = 0;
/** 卸载后终止后续清理批次和列表请求。 */
let disposed = false;

/**
 * 查询所选缓存类型；列表失败时保留同一类型已有的数据。
 * @param reset 是否提交表单并从首批查询；false 时延续当前游标。
 */
async function load(reset = true): Promise<void> {
  if (clearing.value || disposed) return;
  const current = ++sequence;
  loading.value = true;
  try {
    if (!spaces.value.length) {
      const list = await api('/sys/cache/list', {});
      if (current !== sequence) return;
      spaces.value = list;
    }
    if (reset) {
      const name = searchForm.value.name || spaces.value[0]?.name;
      const space = spaces.value.find((item) => item.name === name);
      if (space?.name !== selected.value?.name) entries.value = [];
      selected.value = space;
      searchForm.value.name = name;
      keyword = searchForm.value.search?.trim() ?? '';
      cursor.value = '0';
    }
    if (!selected.value) {
      failed.value = false;
      return;
    }
    const result = await api('/sys/cache/entries', {
      name: selected.value.name,
      cursor: cursor.value,
      search: keyword,
    });
    if (current !== sequence) return;
    const combined = new Map<string, CacheEntryInfo>();
    if (!reset)
      for (const entry of entries.value) combined.set(entry.key, entry);
    for (const entry of result.list) combined.set(entry.key, entry);
    entries.value = [...combined.values()].slice(0, 1000);
    cursor.value = result.cursor;
    failed.value = false;
  } catch {
    if (current === sequence) failed.value = true;
  } finally {
    if (current === sequence) loading.value = false;
  }
}

/**
 * 确认后删除已查询类型中的缓存键，不受尚未提交的筛选影响。
 * @param key 当前行的不含前缀的缓存键。
 */
async function clearKey(key: string): Promise<void> {
  const name = selected.value?.name;
  if (!name || clearing.value) return;
  await confirm({
    title: '确认删除该缓存？',
    async confirmCallback() {
      clearing.value = true;
      try {
        await api('/sys/cache/clear', { name, key });
        entries.value = entries.value.filter((entry) => entry.key !== key);
        notify('success', '删除成功');
      } finally {
        clearing.value = false;
      }
    },
  });
}

/** 确认后分批清空当前缓存类型；保留清理预算并在异常时报告已完成数量。 */
async function clearSpace(): Promise<void> {
  const space = selected.value;
  if (!space || clearing.value) return;
  await confirm({
    title: `确认清空${space.label}缓存？`,
    async confirmCallback() {
      clearing.value = true;
      clearProgress.value = '';
      let next = '0';
      let removed = 0;
      try {
        for (let round = 0; round < 1000; round += 1) {
          if (disposed) return;
          const result = await api('/sys/cache/clear', {
            name: space.name,
            cursor: next,
          });
          removed += result.removed;
          next = result.cursor;
          clearProgress.value = `已清理 ${removed} 项`;
          if (next === '0') break;
        }
        if (next !== '0') notify('warning', '尚有缓存未清空，请继续清理');
        else notify('success', '清空成功');
      } catch {
        notify('error', `清空中断，已清理 ${removed} 项`);
      } finally {
        clearing.value = false;
      }
      await load(true);
    },
  });
}

onMounted(() => {
  void load(true);
});
onBeforeUnmount(() => {
  disposed = true;
  sequence += 1;
});
</script>
