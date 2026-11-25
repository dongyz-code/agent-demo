<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="runSearchColumns"
        @submit="load(true)"
        @reset="load(true)"
      />
    </div>
    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-base font-semibold">执行记录</h2>
          <el-tag v-if="scheduleId" closable @close="clearPlan">
            当前计划
          </el-tag>
          <span class="text-sm text-gray-600">共 {{ count }} 条</span>
        </div>
        <div class="flex items-center gap-2">
          <el-checkbox v-model="autoRefresh">自动刷新</el-checkbox>
          <el-button :loading="loading" @click="load()">刷新</el-button>
        </div>
      </div>
      <el-alert
        v-if="failed"
        class="mb-3"
        type="error"
        :closable="false"
        title="执行记录加载失败，请刷新重试。"
      />
      <v-table
        :data="tableData"
        :rows="runRows"
        :loading="loading"
        empty-text="暂无匹配记录；计划触发后会在此保留执行及跳过记录"
      >
        <template #plannedAt="{ row }">
          {{ monitorTime(row.plannedAt) }}
        </template>
        <template #trigger="{ row }">
          <span v-if="row.trigger === 'manual'">人工执行</span>
          <span v-else>自动调度</span>
        </template>
        <template #status="{ row }">
          <el-tag :type="runStatusType(row.status)">
            {{ runLabels[row.status] }}
          </el-tag>
        </template>
        <template #actions="{ row }">
          <el-button link type="primary" @click="drawer?.open(row.id)">
            详情
          </el-button>
        </template>
      </v-table>
      <page-component class="mt-4" @update:model-value="load()" />
      <p class="mt-4 text-xs text-gray-600">
        保留最近 30
        天已完成记录，活动任务持续保留。重试、耗时及日志来自统一任务中心。
      </p>
    </div>
    <run-detail-drawer ref="drawer" />
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useIntervalFn } from '@vueuse/core';
import { ElAlert, ElButton, ElCheckbox, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';
import { api } from '@/utils';
import {
  monitorTime,
  runLabels,
  runRows,
  runSearchColumns,
  runStatusType,
} from '../utils';
import RunDetailDrawer from './components/RunDetailDrawer.vue';
import type { ScheduleRunInfo } from '@/types';
import type { RunSearchForm } from '../types';

const route = useRoute();
const router = useRouter();
const scheduleId = computed(() => String(route.query.scheduleId ?? ''));
const searchForm = ref<RunSearchForm>({});
const runs = shallowRef<ScheduleRunInfo[]>([]);
const tableData = computed(() => runs.value.map((run) => ({ ...run })));
const count = ref(0);
const failed = ref(false);
const loading = ref(false);
/** 区分后台读取和遮罩状态，避免轮询请求重叠。 */
const refreshing = ref(false);
const autoRefresh = ref(false);
const drawer = ref<InstanceType<typeof RunDetailDrawer>>();
const { pageComponent, pageRange, setPageData } = usePage({
  page: { size: 20 },
});
/** 请求序列防止旧页响应覆盖当前页。 */
let sequence = 0;
/** 已提交的筛选快照。 */
let filter: RunSearchForm = {};
/**
 * 分页查询跨实例的持久化触发台账。
 * @param reset 是否提交筛选并回到第一页。
 * @param silent 是否后台刷新。
 */
async function load(reset = false, silent = false): Promise<void> {
  if (silent && refreshing.value) return;
  if (reset) {
    setPageData({ current: 1 });
    filter = { ...searchForm.value };
  }
  const current = ++sequence;
  refreshing.value = true;
  if (!silent) loading.value = true;
  try {
    const result = await api('/sys/schedule/runs', {
      scheduleId: scheduleId.value || undefined,
      search: filter.search,
      status: filter.status || undefined,
      trigger: filter.trigger || undefined,
      from: filter.time?.[0],
      to: filter.time?.[1],
      limit: pageRange.value,
    });
    if (current !== sequence) return;
    runs.value = result.list;
    count.value = result.count;
    setPageData({ total: result.count });
    failed.value = false;
  } catch {
    if (current === sequence) {
      failed.value = true;
      autoRefresh.value = false;
    }
  } finally {
    if (current === sequence) {
      loading.value = false;
      refreshing.value = false;
    }
  }
}
/** 清除路由携带的单计划筛选。 */
function clearPlan(): void {
  void router.replace({ name: 'monitor.runs' });
}
watch(
  scheduleId,
  () => {
    void load(true);
  },
  { immediate: true },
);
useIntervalFn(() => {
  if (autoRefresh.value && document.visibilityState === 'visible')
    void load(false, true);
}, 5000);
onBeforeUnmount(() => {
  sequence += 1;
});
</script>
