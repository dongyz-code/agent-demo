<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="scheduleSearchColumns"
        @submit="load(true)"
        @reset="load(true)"
      />
    </div>
    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <strong>定时任务</strong>
        <div class="flex flex-wrap items-center gap-2">
          <el-button @click="records?.open()">执行记录</el-button>
          <el-button
            v-if="store.hasPermission('actions.schedule.edit')"
            type="primary"
            @click="editor?.open()"
          >
            新建任务
          </el-button>
        </div>
      </div>
      <el-alert
        v-if="failed"
        class="mb-3"
        type="error"
        :closable="false"
        title="任务加载失败，请重试。"
      />
      <v-table
        class="min-h-0 flex-1"
        :data="tableData"
        :rows="rows"
        :loading="loading"
        :props="{ emptyText: '暂无定时任务' }"
      >
        <template #name="{ row }">
          <div class="font-medium">{{ row.name }}</div>
          <div class="mt-1 text-xs text-gray-600">
            {{ row.handlerLabel }}
          </div>
        </template>
        <template #cron="{ row }">
          <span :title="`${row.cron} · ${row.timezone}`">
            {{ cronText(row.cron) }}
          </span>
        </template>
        <template #enabled="{ row }">
          <el-switch
            :model-value="row.enabled"
            :disabled="
              !store.hasPermission('actions.schedule.toggle') || busy || failed
            "
            active-text="启用"
            inactive-text="暂停"
            inline-prompt
            @change="operate('toggle', row)"
          />
        </template>
        <template #lastRun="{ row }">
          <template v-if="row.lastRun">
            <el-tag :type="runStatusType(row.lastRun.status)" size="small">
              {{ runLabels[row.lastRun.status] }}
            </el-tag>
            <div class="mt-1 text-xs text-gray-600">
              {{ monitorTime(row.lastRun.plannedAt) }}
            </div>
          </template>
          <span v-else class="text-gray-500">尚未触发</span>
        </template>
        <template #nextRunAt="{ row }">
          {{ monitorTime(row.nextRunAt) }}
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
    <schedule-editor ref="editor" @saved="load()" />
    <schedule-runs-drawer ref="records" />
  </section>
</template>
<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { useIntervalFn, useMediaQuery } from '@vueuse/core';
import { ElAlert, ElButton, ElSwitch, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';
import VActionButtonGroup from '@/components/action-button-group/VActionButtonGroup.vue';
import { useStore } from '@/models';
import { api, confirm, notify } from '@/utils';
import ScheduleEditor from './components/ScheduleEditor.vue';
import ScheduleRunsDrawer from './components/ScheduleRunsDrawer.vue';
import {
  cronText,
  monitorTime,
  runLabels,
  runStatusType,
  scheduleRows,
  scheduleSearchColumns,
} from '../utils';
import type { ScheduleInfo } from '@/types';
import type { ScheduleSearchForm } from '../types';
import type { ActionButtonItem } from '@/components/action-button-group/types';

const store = useStore();
const editor = ref<InstanceType<typeof ScheduleEditor>>();
const records = ref<InstanceType<typeof ScheduleRunsDrawer>>();
const searchForm = ref<ScheduleSearchForm>({});
const plans = shallowRef<ScheduleInfo[]>([]);
const tableData = computed(() => plans.value.map((plan) => ({ ...plan })));
const compact = useMediaQuery('(max-width: 640px)');
/** 窄屏收起低频操作，避免固定操作列挡住任务名称。 */
const actionCount = computed(() => {
  if (compact.value) return 1;
  return 3;
});
const rows = computed(() => {
  if (!compact.value) return scheduleRows;
  return scheduleRows.map((column) => {
    if (column.value === 'actions') return { ...column, width: 130 };
    return column;
  });
});
const loading = ref(false);
/** 区分后台读取和遮罩状态，避免轮询请求重叠。 */
const refreshing = ref(false);
const failed = ref(false);
const busy = ref(false);
const { pageComponent, pageRange, setPageData } = usePage({
  page: { size: 20 },
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
/** 只有最近请求可以更新列表。 */
let sequence = 0;
/** 已提交筛选，轮询不会应用尚未提交的输入。 */
let filter: ScheduleSearchForm = {};
/**
 * 服务端分页查询，后台轮询不遮住已有表格。
 * @param reset 是否提交新筛选并回到第一页。
 * @param silent 是否静默更新。
 */
async function load(reset = false, silent = false): Promise<void> {
  if (silent && (refreshing.value || busy.value)) return;
  if (reset) {
    setPageData({ current: 1 });
    filter = { ...searchForm.value };
  }
  const current = ++sequence;
  refreshing.value = true;
  if (!silent) loading.value = true;
  try {
    const query = { ...filter, limit: pageRange.value };
    // 搜索 schema 的枚举键是字符串，统一转换为协议中的布尔值。
    if (
      query.enabled !== undefined &&
      query.enabled !== null &&
      String(query.enabled) !== ''
    )
      query.enabled = String(query.enabled) === 'true';
    else delete query.enabled;
    const result = await api('/sys/schedule/list', query);
    if (current !== sequence) return;
    plans.value = result.list;
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
/**
 * 与资料库页共用行内操作组，删除等低频操作进入“更多”。
 * @param plan 当前任务及其执行状态。
 * @returns 按编辑、执行、记录、删除顺序排列的授权操作。
 */
function getActions(plan: ScheduleInfo): ActionButtonItem[] {
  return [
    {
      key: 'edit',
      label: '编辑',
      isShow: store.hasPermission('actions.schedule.edit'),
      disabled: busy.value || failed.value,
      handler: () => editor.value?.open(plan),
    },
    {
      key: 'run',
      label: '执行一次',
      isShow: store.hasPermission('actions.schedule.run'),
      disabled: busy.value || failed.value || plan.active,
      handler: () => run(plan),
    },
    { key: 'records', label: '记录', handler: () => records.value?.open(plan) },
    {
      key: 'remove',
      label: '删除',
      type: 'danger',
      isShow: store.hasPermission('actions.schedule.delete'),
      disabled: busy.value || failed.value,
      handler: () => operate('remove', plan),
    },
  ];
}
/**
 * 同一确认操作只生成一次幂等标识。
 * @param plan 选中的计划。
 */
async function run(plan: ScheduleInfo): Promise<void> {
  const requestId = crypto.randomUUID();
  await confirm({
    title: `执行一次“${plan.name}”？`,
    confirmCallback: async () => {
      if (busy.value) return;
      busy.value = true;
      try {
        await api('/sys/schedule/run', { id: plan.id, requestId });
        notify('success', '已提交执行');
        await load();
      } finally {
        busy.value = false;
      }
    },
  });
}
/**
 * 启停与删除都只影响未来调度，记录继续保留。
 * @param command 菜单动作。
 * @param plan 选中计划。
 */
async function operate(command: string, plan: ScheduleInfo): Promise<void> {
  let title = '确认启用该任务？';
  if (plan.enabled) title = '确认暂停该任务？';
  if (command === 'remove') title = '确认删除该任务？';
  await confirm({
    title,
    confirmCallback: async () => {
      if (busy.value) return;
      busy.value = true;
      try {
        if (command === 'remove')
          await api('/sys/schedule/remove', { id: plan.id });
        else
          await api('/sys/schedule/toggle', {
            id: plan.id,
            enabled: !plan.enabled,
          });
        notify('success', '操作成功');
        await load();
      } finally {
        busy.value = false;
      }
    },
  });
}
useIntervalFn(() => {
  if (
    !failed.value &&
    plans.value.some((plan) => plan.active) &&
    document.visibilityState === 'visible'
  )
    void load(false, true);
}, 5000);
onMounted(() => {
  void load();
});
onBeforeUnmount(() => {
  sequence += 1;
});
</script>
