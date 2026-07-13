<template>
  <section v-loading="getListLoading">
    <div class="rounded-b bg-white p-4 shadow">
      <el-radio-group v-model="categoryView" class="mb-4" @change="changeCategory">
        <el-radio-button value="all">全部任务</el-radio-button>
        <el-radio-button value="file-processing">文件处理</el-radio-button>
        <el-radio-button value="system">系统任务</el-radio-button>
      </el-radio-group>
      <el-tag
        v-if="taskForm.business_id"
        class="mb-4 ml-3"
        closable
        @close="clearFileFilter"
      >
        已筛选指定文件
      </el-tag>
      <v-schema-form
        v-model="taskForm"
        mode="search"
        :columns="taskColumns"
        :layout="{ labelWidth: '96px' }"
        @reset="getListDebounce(true)"
        @submit="getListDebounce(true)"
      />
    </div>

    <div class="mt-2 rounded bg-white p-4 shadow">
      <div class="flex flex-wrap items-center justify-between gap-4 px-4">
        <div class="flex items-center gap-6">
          <v-icon
            :icon="refresh.icon"
            :tips="refresh.tips"
            @click="getList(true)"
          />

          <v-schedule v-if="user?.sys_admin && categoryView !== 'file-processing'" />

          <div class="flex items-center gap-4" v-if="sqlCounts.length">
            <div
              class="flex items-center"
              v-for="{ label, count, status } in sqlCounts"
              :key="label"
            >
              <TablerPointFilled
                class="text-xl"
                :style="{
                  color: colorMap[status],
                }"
              />
              <span class="text-sm"> {{ label }}({{ numSplit(count) }}) </span>
            </div>
          </div>
        </div>
        <page-component @update:model-value="getListDebounce()" />
      </div>

      <v-table :data="tableData" :rows="tableRows">
        <template #status_text="{ row }">
          <div class="flex items-center">
            <TablerPointFilled
              class="text-xl"
              :style="{
                color: colorMap[row.self.status],
              }"
            />
            <span>{{ row.status_text }}</span>
          </div>
        </template>
        <template #edit="{ row }">
          <div class="flex items-center justify-center gap-4 text-lg">
            <el-button
              v-if="row.self.file_task"
              link
              @click="fileTaskDetailRef?.open(row.task_id)"
            >
              详情
            </el-button>
            <v-icon
              v-else
              class="hover:text-primary"
              v-for="{ label, method, icon } in icons.filter((x) =>
                x.visible(row),
              )"
              :key="label"
              @click="method({ row })"
              :icon="icon"
              :tips="label"
            />
          </div>
        </template>
        <template #file_name="{ row }">{{ row.self.file_task?.filename ?? '-' }}</template>
        <template #execution_no="{ row }">
          {{ row.self.file_task ? `第 ${row.self.file_task.execution_no} 次` : '-' }}
        </template>
        <template #stage="{ row }">{{ fileStageLabel(row.self.current_stage) }}</template>
        <template #progress="{ row }">{{ row.self.progress }}%</template>
        <template #dataset="{ row }">{{ row.self.file_task?.dataset_name ?? '-' }}</template>
        <template #infos="{ row }">
          <div class="space-y-1 text-sm">
            <div
              class="flex items-center gap-1"
              v-for="{ label, value } in row.infos"
              :key="label"
            >
              <span>{{ label }}:</span>
              <span>{{ value }}</span>
            </div>
          </div>
        </template>
      </v-table>
    </div>

    <v-dialog v-model="taskLog.visible" width="90%" top="5vh">
      <template #header>
        <div class="flex items-center gap-4">
          日志
          <v-icon
            v-if="taskLog.row?.self.status === 'pending'"
            :icon="refresh.icon"
            :tips="refresh.tips"
            @click="getLogs()"
          />
        </div>
      </template>
      <!-- <v-json-view :json="taskLog.data"></v-json-view> -->
      <pre class="rounded bg-gray-950 p-4 whitespace-pre-wrap text-white">
        {{ taskLog.data.join('\n') }}
      </pre>
    </v-dialog>
    <file-task-detail ref="fileTaskDetailRef" @changed="getList(true)" />
  </section>
</template>

<script setup lang="ts">
import VSchedule from './components/Schedule.vue';
import FileTaskDetail from './components/FileTaskDetail.vue';

import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { ElButton, ElRadioButton, ElRadioGroup, ElTag } from 'element-plus';
import { useRoute } from 'vue-router';
import {
  arrObject,
  dayJsformat,
  debounce,
  handleTime,
  numSplit,
} from '@repo/utils-browser';
import { api, confirm, httpCache, notify } from '@/utils';
import { staticMapping, staticOptions } from '@/constants';
import {
  loadingFunc,
  VTable,
  VDialog,
  VIcon,
  usePage,
  VSchemaForm,
} from '@repo/ui';

import VJsonView from './JsonView.vue';

import { useStore } from '@/models';
import { storeToRefs } from 'pinia';
import { adminPermissionKey } from '@repo/shared/permission';

import IconParkOutlineCloseOne from '~icons/icon-park-outline/close-one';
import IconParkOutlineLog from '~icons/icon-park-outline/log';
import IconParkOutlineRefresh from '~icons/icon-park-outline/refresh';
import TablerPointFilled from '~icons/tabler/point-filled';

import type { SearchForm, TaskItem, TaskType } from './types';
import type { IconType, SchemaFormColumn, TableRow } from '@repo/ui';

const refresh = {
  icon: IconParkOutlineRefresh,
  tips: '刷新',
};

const store = useStore();
const { user } = storeToRefs(store);
const route = useRoute();

/** 任务中心当前一级分类视图。 */
const categoryView = ref<'all' | 'file-processing' | 'system'>('all');
const fileTaskDetailRef = ref<InstanceType<typeof FileTaskDetail>>();
const datasets = ref<{ datasetId: string; name: string }[]>([]);

/** 任务类型 */
const taskType = shallowRef<TaskType[]>([]);

/** 任务列表 */
const tasks = shallowRef<TaskItem[]>([]);

const sqlCounts = shallowRef<
  { status: TaskItem['status']; label: string; count: number }[]
>([]);

const colorMap: Record<TaskItem['status'], string> = {
  'to-be-started': 'var(--color-gray-500)',
  pending: 'var(--color-yellow-500)',
  completed: 'var(--color-green-500)',
  failed: 'var(--color-red-500)',
  killed: 'var(--color-indigo-500)',
  deleted: 'var(--color-gray-500)',
};

/** 任务日志 */
const taskLog = reactive({
  visible: false,
  row: undefined as undefined | (typeof tableData)['value'][number],
  data: [] as string[],
});

/** 分页组件 */
const { pageComponent, setPageData, pageRange } = usePage({
  props: {
    align: 'left',
  },
  page: {
    size: 50,
  },
});

const taskForm = shallowRef<SearchForm>({});

/** 将一级分类视图合并到接口筛选条件。 */
function getTaskFilter(): SearchForm {
  return {
    ...taskForm.value,
    category:
      categoryView.value === 'all' ? undefined : categoryView.value,
  };
}

/** 切换任务分类并重新统计。 */
function changeCategory() {
  void getList(true);
}

/** 清除从文件管理页面携带的文件筛选。 */
function clearFileFilter() {
  taskForm.value = { ...taskForm.value, business_id: undefined };
  void getList(true);
}

/** 任务列表查询 schema。 */
const taskColumns = computed<SchemaFormColumn<SearchForm>[]>(() => [
  {
    dataIndex: 'search',
    fieldProps: {
      clearable: true,
      placeholder: '输入关键词',
    },
    title: '搜索',
    valueType: 'text',
  },
  {
    dataIndex: 'create_timestamp',
    title: '任务添加时间',
    valueType: 'dateRange',
  },
  {
    data: {
      type: 'select',
      options: computed(() =>
        taskType.value.map((self) => ({
          label: self.name,
          value: self.key,
        })),
      ),
      props: {
        clearable: true,
      },
    },
    dataIndex: 'key',
    title: '任务类型',
  },
  {
    data: {
      type: 'select',
      options: staticOptions.task_status,
      props: {
        clearable: true,
      },
    },
    dataIndex: 'status',
    title: '任务状态',
  },
  {
    data: {
      type: 'select',
      options: staticOptions.task_update_mode,
      props: {
        clearable: true,
      },
    },
    dataIndex: 'trigger_method',
    title: '触发方式',
  },
  ...(categoryView.value !== 'system'
    ? [
        {
          dataIndex: 'file_name' as const,
          title: '文件名',
          valueType: 'text' as const,
          fieldProps: { clearable: true },
        },
        {
          dataIndex: 'dataset_id' as const,
          title: '知识库',
          valueType: 'select' as const,
          valueEnum: Object.fromEntries(
            datasets.value.map((dataset) => [dataset.datasetId, dataset.name]),
          ),
          fieldProps: { clearable: true },
        },
        {
          dataIndex: 'current_stage' as const,
          title: '当前阶段',
          valueType: 'select' as const,
          valueEnum: {
            queued: '等待执行',
            reading: '读取内容',
            parsing: '解析内容',
            normalizing: '整理内容',
            segmenting: '生成知识片段',
            'rag-ingestion': 'RAG 接入',
            completed: '已完成',
          },
          fieldProps: { clearable: true },
        },
      ]
    : []),
]);

/** 任务列表 */
const tableData = computed(() => {
  const map = arrObject(taskType.value, 'key', 'name');

  return tasks.value.map((self) => {
    const {
      start_timestamp,
      end_timestamp,
      trigger_method,
      create_timestamp,
      task_id,
      task_key,
      status,
      task_name,
      execution_user_id,
    } = self;

    const infos: {
      label: string;
      value: string;
    }[] = [];

    if (start_timestamp) {
      infos.push({
        label: '开始时间',
        value: dayJsformat(start_timestamp, 'YYYY-MM-DD HH:mm:ss'),
      });
    }

    if (end_timestamp) {
      infos.push({
        label: '结束时间',
        value: dayJsformat(end_timestamp, 'YYYY-MM-DD HH:mm:ss'),
      });
    }

    if (start_timestamp && status !== 'deleted') {
      const duration = handleTime(
        new Date(end_timestamp ?? new Date()).getTime() -
          new Date(start_timestamp).getTime(),
      );
      infos.push({
        label: '累计用时',
        value: duration,
      });
    }

    return {
      self,
      task_id,
      task_key,
      group_name:
        self.task_category === 'file-processing'
          ? '文件处理'
          : map[task_key] ?? task_key,
      task_name,
      // detail: JSON.stringify(detail),
      create_timestamp: dayJsformat(create_timestamp, 'YYYY-MM-DD HH:mm:ss'),
      infos,
      status_text: (() => {
        let text = staticMapping.task_status.get(status);
        if (
          self.task_category === 'system' &&
          status === 'pending' &&
          !self.running
        ) {
          text += '(已过期)';
        }
        return text;
      })(),
      update_model_str: staticMapping.task_update_mode.get(trigger_method),
      execution_user_id,
      execution_user_name: execution_user_id
        ? httpCache.user.mapping.value?.[execution_user_id]?.nickname ||
          execution_user_id
        : execution_user_id,
    };
  });
});

/** 任务列表列 */
const systemTableRows: TableRow<
  keyof (typeof tableData)['value'][number] | 'edit'
>[] = [
  {
    label: '任务类型',
    value: 'group_name',
    minWidth: 160,
  },
  {
    label: '状态',
    slot: 'status_text',
    width: 150,
  },
  {
    label: '触发方式',
    value: 'update_model_str',
    width: 100,
  },
  {
    label: '触发用户',
    value: 'execution_user_name',
    width: 120,
  },
  {
    label: '添加日期',
    value: 'create_timestamp',
    width: 180,
  },
  {
    label: '信息',
    slot: 'infos',
    width: 240,
  },
  {
    label: '任务名称',
    value: 'task_name',
    minWidth: 300,
  },
  {
    label: '操作',
    slot: 'edit',
    align: 'center',
    width: 160,
    fixed: 'right',
  },
];

/** 文件任务视图使用的业务列。 */
const fileTableRows: TableRow[] = [
  { label: '文件', value: 'file_name', slot: 'file_name', minWidth: 180 },
  { label: '执行次数', value: 'execution_no', slot: 'execution_no', width: 100 },
  { label: '状态', value: 'status_text', slot: 'status_text', width: 130 },
  { label: '当前阶段', value: 'stage', slot: 'stage', width: 140 },
  { label: '进度', value: 'progress', slot: 'progress', width: 80 },
  { label: '知识库', value: 'dataset', slot: 'dataset', minWidth: 140 },
  { label: '触发用户', value: 'execution_user_name', width: 120 },
  { label: '添加日期', value: 'create_timestamp', width: 180 },
  { label: '操作', value: 'edit', slot: 'edit', width: 100, fixed: 'right' },
];

/** 根据分类选择任务表格列。 */
const tableRows = computed(() =>
  categoryView.value === 'file-processing' ? fileTableRows : systemTableRows,
);

/** 获取任务列表 */
const { getList, getListLoading, getLogs } = loadingFunc({
  funcs: {
    async getList(withCount?: boolean) {
      if (withCount) {
        setPageData({ current: 1 });
      }

      const listGet = async () => {
        const list = await api('/sys/task/list', {
          withCount,
          limit: pageRange.value,
          form: getTaskFilter(),
        });
        if (withCount) {
          setPageData({ total: list.count });
        }
        tasks.value = list.list;
      };

      const countsGet = async () => {
        if (!withCount) {
          return;
        }
        const counts = await api('/sys/task/counts', {
          form: getTaskFilter(),
        });
        const map = arrObject(counts, 'status', 'count');
        sqlCounts.value = staticOptions.task_status
          .filter((x) => map[x.value])
          .map((self) => ({
            label: self.label,
            count: map[self.value] ?? 0,
            status: self.value,
          }));
      };

      await Promise.all([listGet(), countsGet()]);
    },
    async getLogs() {
      const task_id = taskLog.row?.task_id;
      if (!task_id) {
        return;
      }
      const log = await api('/sys/task/logs', {
        task_id,
      });
      taskLog.data = log;
    },
  },
});

const getListDebounce = debounce(getList);

const icons: {
  label: string;
  method: (body: {
    row: (typeof tableData.value)[number];
  }) => void | Promise<void>;
  icon: IconType;
  visible: (row: (typeof tableData.value)[number]) => boolean;
}[] = [
  {
    label: '查看日志',
    method: async ({ row }) => {
      taskLog.row = row;
      await getLogs();
      taskLog.visible = true;
    },
    icon: IconParkOutlineLog,
    visible: (row) =>
      store.hasPermission(adminPermissionKey('actions.task.logs')) &&
      row.self.status !== 'to-be-started' &&
      row.self.status !== 'deleted',
  },
];

/** 将文件任务阶段转换为业务文案。 */
function fileStageLabel(stage: string | null) {
  const labels: Record<string, string> = {
    queued: '等待执行',
    reading: '读取内容',
    parsing: '解析内容',
    normalizing: '整理内容',
    segmenting: '生成知识片段',
    'rag-ingestion': 'RAG 接入',
    completed: '已完成',
  };
  return stage ? labels[stage] ?? stage : '-';
}

onMounted(async () => {
  const fileId = typeof route.query.fileId === 'string' ? route.query.fileId : undefined;
  const category = route.query.category;
  if (category === 'file-processing' || category === 'system') {
    categoryView.value = category;
  }
  if (fileId) {
    taskForm.value = { ...taskForm.value, business_id: fileId };
  }
  const processingOptions = await api('/documents/file-processing-options', {});
  datasets.value = processingOptions.datasets;
  await Promise.all([
    getList(true),
    httpCache.user.get({ full: true }),
  ]);
});
</script>
