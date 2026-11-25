<template>
  <div class="grid min-h-80 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
    <aside
      class="flex flex-wrap content-start gap-2 lg:flex-col"
      aria-label="缓存业务空间"
    >
      <button
        v-for="space in spaces"
        :key="space.name"
        type="button"
        class="rounded px-3 py-3 text-left transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600"
        :class="{ 'bg-blue-50 text-blue-700': selected?.name === space.name }"
        :aria-pressed="selected?.name === space.name"
        @click="selectSpace(space)"
      >
        <span class="font-medium">{{ space.label }}</span>
        <span class="mt-1 block text-xs">{{ space.name }}</span>
      </button>
    </aside>
    <div v-if="selected" class="min-w-0">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="max-w-2xl">
          <h3 class="font-medium">{{ selected.label }}</h3>
          <p class="mt-1 text-sm text-gray-600">{{ selected.description }}</p>
          <p class="mt-1 text-xs text-gray-600">
            默认有效期 {{ ttlText(selected.ttl) }}
            <span v-if="!selected.inspectable">· 此空间不开放值查看</span>
          </p>
        </div>
        <el-button
          v-if="store.hasPermission('actions.cache.clear')"
          type="danger"
          plain
          :disabled="clearing || loading || failed"
          @click="clearSpace"
        >
          清理空间
        </el-button>
      </div>
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="cacheSearchColumns"
        @submit="scan(true)"
        @reset="scan(true)"
      />
      <div class="my-3 flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm text-gray-600">
          已展示 {{ entries.length }} 个键
          <span v-if="scanned">· 本轮匹配扫描 {{ scanned }} 个键</span>
        </span>
        <el-button :loading="loading" :disabled="clearing" @click="scan(true)">
          重新扫描
        </el-button>
      </div>
      <el-alert
        v-if="failed"
        class="mb-3"
        type="error"
        :closable="false"
        title="缓存读取失败，请检查 Redis 状态后重新扫描。"
      />
      <el-alert
        v-if="clearProgress"
        class="mb-3"
        type="info"
        :closable="false"
        :title="clearProgress"
      />
      <v-table
        :data="tableData"
        :rows="cacheRows"
        :loading="loading"
        empty-text="本批没有匹配的键；若仍有下一批，可继续扫描"
      >
        <template #ttl="{ row }">{{ ttlText(row.ttl) }}</template>
        <template #actions="{ row }">
          <el-button
            v-if="
              selected.inspectable && store.hasPermission('actions.cache.view')
            "
            link
            type="primary"
            @click="valueDialog?.open(selected.name, row.key)"
          >
            查看
          </el-button>
          <el-button
            v-if="store.hasPermission('actions.cache.clear')"
            link
            type="danger"
            :disabled="clearing || loading || failed"
            @click="clearKey(row.key)"
          >
            删除
          </el-button>
          <span
            v-if="
              !store.hasPermission('actions.cache.clear') &&
              !(
                selected.inspectable &&
                store.hasPermission('actions.cache.view')
              )
            "
          >
            —
          </span>
        </template>
      </v-table>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="max-w-2xl text-xs text-gray-600">
          游标扫描期间键可能新增、过期或重复，列表会按键去重。TTL
          为扫描时的快照，结果不代表全库键总数。
        </p>
        <el-button
          v-if="cursor !== '0'"
          :disabled="clearing || entries.length >= 1000"
          :loading="loading"
          @click="scan()"
        >
          继续扫描
        </el-button>
        <span v-else-if="hasScanned" class="text-sm text-gray-600">
          本轮扫描完成
        </span>
      </div>
      <p v-if="entries.length >= 1000" class="mt-2 text-sm text-gray-600">
        已达到 1000 个键的展示上限，请缩小关键字范围重新扫描。
      </p>
    </div>
    <p v-else class="text-sm text-gray-600">尚未注册可管理的缓存空间。</p>
    <cache-value-dialog ref="valueDialog" />
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElAlert, ElButton } from 'element-plus';
import { VSchemaForm, VTable } from '@repo/ui';
import { useStore } from '@/models';
import { api, confirm, notify } from '@/utils';
import { cacheRows, cacheSearchColumns, ttlText } from '../../utils';
import CacheValueDialog from './CacheValueDialog.vue';
import type { CacheEntryInfo, CacheInfo } from '@/types';
import type { CacheSearchForm } from '../../types';

const props = defineProps<{
  /** 由页面读取的已注册空间。 */ spaces: CacheInfo[];
}>();
const store = useStore();
const selected = ref<CacheInfo>();
const searchForm = ref<CacheSearchForm>({});
const entries = ref<CacheEntryInfo[]>([]);
const tableData = computed(() => entries.value.map((entry) => ({ ...entry })));
const cursor = ref('0');
const scanned = ref(0);
const loading = ref(false);
const failed = ref(false);
const clearing = ref(false);
const clearProgress = ref('');
const hasScanned = ref(false);
const valueDialog = ref<InstanceType<typeof CacheValueDialog>>();
/** 防止离开页面和切换空间后更新旧数据。 */
let sequence = 0;
/** 卸载后停止分批清理循环。 */
let disposed = false;
/** 提交过的关键字，不把未提交输入带到下一批。 */
let keyword = '';
/**
 * 切换空间重置游标，清理进行中禁止切换。
 * @param space 注册空间。
 */
function selectSpace(space: CacheInfo): void {
  if (clearing.value) return;
  selected.value = space;
  entries.value = [];
  hasScanned.value = false;
  searchForm.value = {};
  clearProgress.value = '';
  void scan(true);
}
/**
 * 有预算地获取下一批；明确重新扫描时才丢弃旧列表。
 * @param reset 是否重新从零扫描。
 */
async function scan(reset = false): Promise<void> {
  if (!selected.value) return;
  if (reset) {
    cursor.value = '0';
    scanned.value = 0;
    keyword = searchForm.value.search ?? '';
  }
  const current = ++sequence;
  const name = selected.value.name;
  loading.value = true;
  try {
    const result = await api('/sys/cache/entries', {
      name,
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
    scanned.value += result.scanned;
    failed.value = false;
    hasScanned.value = true;
  } catch {
    if (current === sequence) failed.value = true;
  } finally {
    if (current === sequence) loading.value = false;
  }
}
/**
 * 删除当前空间一个键，服务端重新验证资源范围。
 * @param key 不带前缀的业务键。
 */
async function clearKey(key: string): Promise<void> {
  const name = selected.value?.name;
  if (!name || clearing.value) return;
  await confirm({
    title: `删除缓存键“${key}”？后续读取会回源重建。`,
    confirmCallback: async () => {
      clearing.value = true;
      try {
        await api('/sys/cache/clear', { name, key });
        entries.value = entries.value.filter((entry) => entry.key !== key);
        notify('success', '缓存键已删除');
      } finally {
        clearing.value = false;
      }
    },
  });
}
/** 分批清理指定空间，最多运行 1000 批，进度明确并可在异常后重试。 */
async function clearSpace(): Promise<void> {
  const space = selected.value;
  if (!space || clearing.value) return;
  await confirm({
    title: `清理“${space.label}”全部缓存？只影响当前应用的该业务空间，后续访问会回源。`,
    confirmCallback: async () => {
      clearing.value = true;
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
          clearProgress.value = `正在清理，已移除 ${removed} 个键`;
          if (next === '0') break;
        }
        clearProgress.value = `已清理 ${removed} 个键。业务访问期间可能按需产生新缓存。`;
        if (next !== '0')
          clearProgress.value = `已清理 ${removed} 个键，达到单轮预算，可再次清理继续。`;
        await scan(true);
      } catch {
        clearProgress.value = `清理中断，已移除 ${removed} 个键，请检查连接后重试。`;
      } finally {
        clearing.value = false;
      }
    },
  });
}
watch(
  () => props.spaces,
  (spaces) => {
    if (!selected.value && spaces[0]) selectSpace(spaces[0]);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  sequence += 1;
  disposed = true;
});
</script>
