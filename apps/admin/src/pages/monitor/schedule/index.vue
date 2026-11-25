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
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold">定时计划</h2>
          <p class="mt-1 text-sm text-gray-600">
            共 {{ summary.total }} 项 · 启用 {{ summary.enabled }} 项 · 活动中
            {{ summary.active }} 项 ·
            <span :class="{ 'text-red-600': summary.failed24h > 0 }">
              近 24 小时失败 {{ summary.failed24h }} 次
            </span>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <el-checkbox v-model="autoRefresh">自动刷新</el-checkbox>
          <el-button :loading="loading" @click="load()">刷新</el-button>
          <el-button
            v-if="store.hasPermission('actions.schedule.edit')"
            type="primary"
            @click="editor?.open()"
          >
            新建计划
          </el-button>
        </div>
      </div>
      <el-alert
        v-if="failed"
        class="mb-3"
        type="error"
        :closable="false"
        title="计划加载失败，已保留上次数据。请刷新重试。"
      />
      <v-table
        :data="tableData"
        :rows="scheduleRows"
        :loading="loading"
        empty-text="暂无定时计划，可新建计划并选择业务处理器"
      >
        <template #name="{ row }">
          <div class="font-medium">{{ row.name }}</div>
          <div class="mt-1 text-xs text-gray-600">
            {{ row.handlerLabel }}
            <span v-if="row.active" class="ml-2 text-blue-600">任务活动中</span>
          </div>
        </template>
        <template #cron="{ row }">
          <div>{{ cronText(row.cron) }}</div>
          <code class="text-xs text-gray-600">{{ row.cron }}</code>
          <div class="text-xs text-gray-600">{{ row.timezone }}</div>
        </template>
        <template #enabled="{ row }">
          <el-tag v-if="row.enabled" type="success">启用</el-tag>
          <el-tag v-else type="info">暂停</el-tag>
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
          <el-button
            v-if="store.hasPermission('actions.schedule.edit')"
            link
            type="primary"
            :disabled="busy || failed"
            @click="editor?.open(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="store.hasPermission('actions.schedule.run')"
            link
            type="primary"
            :disabled="busy || failed || row.active"
            @click="run(row)"
          >
            执行一次
          </el-button>
          <el-button
            v-if="store.hasPermission('pages.monitor.runs')"
            link
            @click="showRuns(row.id)"
          >
            记录
          </el-button>
          <el-dropdown
            v-if="
              store.hasPermission('actions.schedule.toggle') ||
              store.hasPermission('actions.schedule.delete')
            "
            trigger="click"
            :disabled="busy || failed"
            @command="(command: string) => operate(command, row)"
          >
            <el-button link aria-label="更多计划操作">更多</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-if="store.hasPermission('actions.schedule.toggle')"
                  command="toggle"
                >
                  {{ row.enabled ? '暂停调度' : '启用调度' }}
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="store.hasPermission('actions.schedule.delete')"
                  command="remove"
                >
                  删除计划
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </v-table>
      <page-component class="mt-4" @update:model-value="load()" />
      <p class="mt-4 text-xs text-gray-600">
        计划配置跨重启保留。暂停只影响后续触发；同一计划的活动任务不会重叠入队。列表时间按浏览器时区显示。
      </p>
    </div>
    <schedule-editor ref="editor" @saved="load()" />
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElTag,
} from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';
import { useRouter } from 'vue-router';
import { useStore } from '@/models';
import { api, confirm, notify } from '@/utils';
import ScheduleEditor from './components/ScheduleEditor.vue';
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

const store = useStore();
const router = useRouter();
const editor = ref<InstanceType<typeof ScheduleEditor>>();
const searchForm = ref<ScheduleSearchForm>({});
const plans = shallowRef<ScheduleInfo[]>([]);
const tableData = computed(() => plans.value.map((plan) => ({ ...plan })));
const summary = ref({ total: 0, enabled: 0, active: 0, failed24h: 0 });
const loading = ref(false);
/** 区分后台读取和遮罩状态，避免轮询请求重叠。 */
const refreshing = ref(false);
const failed = ref(false);
const busy = ref(false);
const autoRefresh = ref(false);
const { pageComponent, pageRange, setPageData } = usePage({
  page: { size: 20 },
});
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
    summary.value = result.summary;
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
/**
 * 跳转独立台账并携带计划筛选。
 * @param id 计划标识。
 */
function showRuns(id: string): void {
  void router.push({ name: 'monitor.runs', query: { scheduleId: id } });
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
        notify('success', '任务已入队，可在执行记录查看进度');
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
  let title = `启用“${plan.name}”的自动调度？`;
  if (plan.enabled)
    title = `暂停“${plan.name}”的后续调度？已提交任务继续执行。`;
  if (command === 'remove')
    title = `删除计划“${plan.name}”？执行记录会保留，已提交任务继续执行。`;
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
        notify('success', '计划已更新');
        await load();
      } finally {
        busy.value = false;
      }
    },
  });
}
useIntervalFn(() => {
  if (autoRefresh.value && document.visibilityState === 'visible')
    void load(false, true);
}, 5000);
onMounted(() => {
  void load();
});
onBeforeUnmount(() => {
  sequence += 1;
});
</script>
