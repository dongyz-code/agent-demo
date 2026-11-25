<template>
  <el-drawer v-model="visible" :title="title" size="min(1200px, 100vw)">
    <v-schema-form
      v-model="searchForm"
      mode="search"
      :columns="searchColumns"
      @submit="load(true)"
      @reset="load(true)"
    />
    <el-alert
      v-if="failed"
      class="mb-3"
      type="error"
      :closable="false"
      title="记录加载失败，请重试。"
    />
    <v-table
      class="mt-4"
      :data="tableData"
      :rows="rows"
      :loading="loading"
      :props="{ emptyText: '暂无执行记录' }"
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
        <el-button link @click="detailDrawer?.open(row.id)">详情</el-button>
      </template>
    </v-table>
    <page-component class="mt-4" @update:model-value="load()" />
    <run-detail-drawer ref="detailDrawer" />
  </el-drawer>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import { ElAlert, ElButton, ElDrawer, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';
import { api } from '@/utils';
import {
  monitorTime,
  runLabels,
  runRows,
  runSearchColumns,
  runStatusType,
} from '../../utils';
import RunDetailDrawer from './RunDetailDrawer.vue';
import type { ScheduleInfo, ScheduleRunInfo } from '@/types';
import type { RunSearchForm } from '../../types';

const visible = ref(false);
const plan = shallowRef<ScheduleInfo>();
const title = computed(() => {
  if (plan.value) return `${plan.value.name} · 执行记录`;
  return '执行记录';
});
/** 单计划无需重复显示名称和名称筛选，全部记录仍保留定位能力。 */
const searchColumns = computed(() => {
  if (plan.value)
    return runSearchColumns.filter((column) => column.dataIndex !== 'search');
  return runSearchColumns;
});
const rows = computed(() => {
  if (plan.value)
    return runRows.filter((column) => column.value !== 'scheduleName');
  return runRows;
});
const searchForm = ref<RunSearchForm>({});
const runs = shallowRef<ScheduleRunInfo[]>([]);
const tableData = computed(() => runs.value.map((run) => ({ ...run })));
const loading = ref(false);
const failed = ref(false);
const refreshing = ref(false);
const detailDrawer = ref<InstanceType<typeof RunDetailDrawer>>();
const { pageComponent, pageRange, setPageData } = usePage({
  page: { size: 20, layout: ['total', 'prev', 'pager', 'next'], pagerCount: 5 },
});
/** 关闭或切换计划后废弃旧查询，后台轮询只使用已提交的条件。 */
let sequence = 0;
let filter: RunSearchForm = {};
/**
 * 在任务页内查看记录；不传计划时包含已删除计划的历史。
 * @param selectedPlan 可选的当前计划，用于筛选和标题。
 */
async function open(selectedPlan?: ScheduleInfo): Promise<void> {
  sequence += 1;
  plan.value = selectedPlan;
  searchForm.value = {};
  runs.value = [];
  failed.value = false;
  visible.value = true;
  await load(true);
}
/**
 * 分页加载记录，后台刷新失败后保留列表并停止轮询。
 * @param reset 是否提交筛选并回到第一页。
 * @param silent 是否后台刷新，不遮挡已有列表。
 */
async function load(reset = false, silent = false): Promise<void> {
  if (!visible.value || (silent && refreshing.value)) return;
  if (reset) {
    setPageData({ current: 1 });
    filter = { ...searchForm.value };
  }
  const current = ++sequence;
  refreshing.value = true;
  if (!silent) loading.value = true;
  try {
    const result = await api('/sys/schedule/runs', {
      scheduleId: plan.value?.id,
      search: filter.search,
      status: filter.status || undefined,
      trigger: filter.trigger || undefined,
      from: filter.time?.[0],
      to: filter.time?.[1],
      limit: pageRange.value,
    });
    if (current !== sequence) return;
    runs.value = result.list;
    setPageData({ total: result.count });
    failed.value = false;
  } catch {
    if (current === sequence) {
      failed.value = true;
    }
  } finally {
    if (current === sequence) {
      loading.value = false;
      refreshing.value = false;
    }
  }
}
watch(visible, (value) => {
  if (value) return;
  sequence += 1;
  loading.value = false;
  refreshing.value = false;
});
useIntervalFn(() => {
  if (
    visible.value &&
    !failed.value &&
    runs.value.some((run) =>
      ['queued', 'running', 'retrying'].includes(run.status),
    ) &&
    document.visibilityState === 'visible'
  )
    void load(false, true);
}, 5000);
onBeforeUnmount(() => {
  sequence += 1;
});
defineExpose({ open });
</script>
