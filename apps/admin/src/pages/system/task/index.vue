<template>
  <section v-loading="getListLoading" class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="taskForm"
        mode="search"
        :columns="taskColumns"
        :layout="{ labelWidth: '96px' }"
        @reset="getListDebounce(true)"
        @submit="getListDebounce(true)"
      />
    </div>

    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <el-button :icon="IconParkOutlineRefresh" @click="getList(true)">
          刷新
        </el-button>
        <div v-if="statusCounts.length" class="flex flex-wrap items-center gap-2">
          <el-tag
            v-for="item in statusCounts"
            :key="item.status"
            :type="getStatusTagType(item.status)"
            effect="plain"
          >
            {{ item.label }} {{ numSplit(item.count) }}
          </el-tag>
        </div>
      </div>

      <v-table class="min-h-0 flex-1" :data="tableData" :rows="tableRows">
        <template #status="{ row }">
          <el-tag :type="getStatusTagType(row.self.status)" effect="light">
            {{ row.statusText }}
          </el-tag>
        </template>
        <template #actions="{ row }">
          <el-button
            v-if="canViewLogs"
            link
            type="primary"
            @click="openLogs(row)"
          >
            查看日志
          </el-button>
        </template>
      </v-table>

      <page-component
        class="mt-4"
        @update:model-value="getListDebounce()"
      />
    </div>

    <v-dialog
      v-model="taskLog.visible"
      :title="taskLog.title"
      width="80%"
      top="5vh"
    >
      <div class="mb-3 flex justify-end">
        <el-button
          :icon="IconParkOutlineRefresh"
          :loading="logsLoading"
          @click="getLogs"
        >
          刷新日志
        </el-button>
      </div>
      <pre
        class="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-950 p-4 text-xs leading-6 text-gray-100"
      >{{ taskLog.data.length ? taskLog.data.join('\n') : '暂无日志' }}</pre>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { ElButton, ElTag } from 'element-plus';
import {
  dayJsformat,
  debounce,
  handleTime,
  numSplit,
} from '@repo/utils-browser';
import {
  VDialog,
  VSchemaForm,
  VTable,
  loadingFunc,
  usePage,
} from '@repo/ui';

import { staticMapping, staticOptions } from '@/constants';
import { useStore } from '@/models';
import { api, httpCache } from '@/utils';
import { adminPermissionKey } from '@repo/shared/permission';

import IconParkOutlineRefresh from '~icons/icon-park-outline/refresh';

import type { SearchForm, TaskItem } from './types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';

/** 任务状态统计展示项。 */
interface TaskStatusCount {
  /** 任务生命周期状态。 */
  status: TaskItem['status'];
  /** 状态中文文案。 */
  label: string;
  /** 当前筛选条件下的任务数量。 */
  count: number;
}

const store = useStore();
const taskForm = shallowRef<SearchForm>({});
const tasks = shallowRef<TaskItem[]>([]);
const statusCounts = shallowRef<TaskStatusCount[]>([]);
const logsLoading = ref(false);
const canViewLogs = computed(() =>
  store.hasPermission(adminPermissionKey('actions.task.logs')),
);

/** 当前日志弹窗上下文。 */
const taskLog = reactive({
  visible: false,
  taskId: '',
  title: '任务日志',
  data: [] as string[],
});

/** 任务列表统一查询字段，不再按实现类型拆分视图。 */
const taskColumns: SchemaFormColumn<SearchForm>[] = [
  {
    dataIndex: 'search',
    title: '任务名称',
    valueType: 'text',
    fieldProps: { clearable: true, placeholder: '名称 / 关键词' },
  },
  {
    dataIndex: 'status',
    title: '任务状态',
    valueType: 'select',
    valueEnum: Object.fromEntries(
      staticOptions.task_status.map((item) => [item.value, item.label]),
    ),
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'trigger_method',
    title: '触发方式',
    valueType: 'select',
    valueEnum: Object.fromEntries(
      staticOptions.task_update_mode.map((item) => [item.value, item.label]),
    ),
    fieldProps: { clearable: true },
  },
  {
    data: {
      type: 'select',
      options: computed(() =>
        Object.entries(httpCache.user.mapping.value ?? {}).map(
          ([value, user]) => ({ label: user.nickname, value }),
        ),
      ),
      props: {
        clearable: true,
        filterable: true,
      },
    },
    dataIndex: 'execution_user_id',
    title: '执行用户',
  },
  {
    dataIndex: 'create_timestamp',
    title: '创建时间',
    valueType: 'dateRange',
  },
];

/** 将通用任务记录转换为列表展示行。 */
const tableData = computed(() =>
  tasks.value.map((self) => {
    let duration = '-';
    if (self.start_timestamp) {
      const endTimestamp = self.end_timestamp ?? new Date();
      duration = handleTime(
        new Date(endTimestamp).getTime() -
          new Date(self.start_timestamp).getTime(),
      );
    }
    let executionUserName = '-';
    if (self.execution_user_id) {
      executionUserName =
        httpCache.user.mapping.value?.[self.execution_user_id]?.nickname ??
        self.execution_user_id;
    }
    return {
      self,
      taskName: self.task_name ?? self.task_key,
      statusText: staticMapping.task_status.get(self.status),
      stage: self.current_stage ?? '-',
      progress: `${self.progress}%`,
      triggerMethod: staticMapping.task_update_mode.get(self.trigger_method),
      executionUserName,
      createdAt: dayJsformat(
        self.create_timestamp,
        'YYYY-MM-DD HH:mm:ss',
      ),
      duration,
      errorMessage: self.error_message ?? '-',
    };
  }),
);

/** 通用任务容器列表列；唯一业务操作是查看日志。 */
const tableRows: TableRow[] = [
  { label: '任务名称', value: 'taskName', minWidth: 260 },
  { label: '状态', value: 'status', slot: 'status', width: 110 },
  { label: '当前阶段', value: 'stage', minWidth: 140 },
  { label: '进度', value: 'progress', width: 80 },
  { label: '触发方式', value: 'triggerMethod', width: 100 },
  { label: '执行用户', value: 'executionUserName', minWidth: 130 },
  { label: '创建时间', value: 'createdAt', width: 180 },
  { label: '累计用时', value: 'duration', width: 120 },
  { label: '错误摘要', value: 'errorMessage', minWidth: 200 },
  { label: '操作', value: 'actions', slot: 'actions', width: 100, fixed: 'right' },
];

/** 任务分页组件固定放在列表底部。 */
const { pageComponent, setPageData, pageRange } = usePage({
  props: { align: 'center' },
  page: { size: 50 },
});

const { getList, getListLoading } = loadingFunc({
  funcs: {
    /**
     * 加载统一任务列表及状态统计。
     *
     * @param withCount 是否重置页码并重新统计。
     */
    async getList(withCount = false): Promise<void> {
      if (withCount) setPageData({ current: 1 });
      const listPromise = api('/sys/task/list', {
        withCount,
        limit: pageRange.value,
        form: taskForm.value,
      });
      const countsPromise = withCount
        ? api('/sys/task/counts', { form: taskForm.value })
        : Promise.resolve(undefined);
      const [result, counts] = await Promise.all([
        listPromise,
        countsPromise,
      ]);
      tasks.value = result.list;
      if (withCount) setPageData({ total: result.count });
      if (counts) {
        const countMap = new Map(
          counts.map((item) => [item.status, item.count]),
        );
        statusCounts.value = staticOptions.task_status.flatMap((item) => {
          const count = countMap.get(item.value);
          if (!count) return [];
          return [{ status: item.value, label: item.label, count }];
        });
      }
    },
  },
});

const getListDebounce = debounce(getList);

/** 查询当前弹窗任务的通用运行日志。 */
async function getLogs(): Promise<void> {
  if (!taskLog.taskId) return;
  logsLoading.value = true;
  try {
    taskLog.data = await api('/sys/task/logs', {
      task_id: taskLog.taskId,
    });
  } finally {
    logsLoading.value = false;
  }
}

/**
 * 打开指定任务的日志弹窗。
 *
 * @param row 当前通用任务展示行。
 */
async function openLogs(row: (typeof tableData.value)[number]): Promise<void> {
  taskLog.taskId = row.self.task_id;
  taskLog.title = `${row.taskName} · 任务日志`;
  taskLog.data = [];
  taskLog.visible = true;
  await getLogs();
}

/** 返回任务状态对应的 Element Plus 标签类型。 */
function getStatusTagType(status: TaskItem['status']) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'pending') return 'warning';
  if (status === 'killed') return 'info';
  return 'info';
}

onMounted(async () => {
  await Promise.all([
    getList(true),
    httpCache.user.get({ full: true }),
  ]);
});
</script>
