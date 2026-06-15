<template>
  <section v-loading="getListLoading">
    <div class="rounded-b bg-white p-4 shadow">
      <task-component @update:model-value="getListDebounce(true)" />
    </div>

    <div class="mt-2 rounded bg-white p-4 shadow">
      <div class="flex flex-wrap items-center justify-between gap-4 px-4">
        <div class="flex items-center gap-6">
          <v-icon
            :icon="refresh.icon"
            :tips="refresh.tips"
            @click="getList(true)"
          />

          <v-schedule v-if="user?.sys_admin" />
          <v-task-add :types="taskType" @create="getList(true)" />

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
            <v-icon
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
  </section>
</template>

<script setup lang="ts">
import VSchedule from './components/Schedule.vue';
import VTaskAdd from './components/TaskAdd.vue';

import { computed, h, onMounted, reactive, shallowRef } from 'vue';
import {
  arrObject,
  dayJsformat,
  debounce,
  handleTime,
  numSplit,
} from '@repo/utils-browser';
import { api } from '@/api';
import { confirm, notify } from '@/plugins/notify';
import { staticMapping, staticOptions } from '@/static';
import {
  loadingFunc,
  VTable,
  VDialog,
  VIcon,
  useFormItems,
  usePage,
  VDatePickerRange,
} from '@repo/ui';

import VJsonView from './JsonView.vue';

import { httpCache } from '@/cache';
import { useStore } from '@/store';
import { storeToRefs } from 'pinia';

import IconParkOutlineCloseOne from '~icons/icon-park-outline/close-one';
import IconParkOutlineLog from '~icons/icon-park-outline/log';
import IconParkOutlineRefresh from '~icons/icon-park-outline/refresh';
import TablerPointFilled from '~icons/tabler/point-filled';

import type { SearchForm, TaskItem, TaskType } from './type';
import type { IconType, TableRow } from '@repo/ui';

const refresh = {
  icon: IconParkOutlineRefresh,
  tips: '刷新',
};

const { user } = storeToRefs(useStore());

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

/** 任务列表查询表单 */
const { taskComponent, taskForm } = useFormItems<SearchForm, 'task'>({
  prefix: 'task',
  form: {},
  options: [
    [
      {
        label: '搜索',
        key: 'search',
        data: {
          type: 'input',
          props: {
            placeholder: '输入关键词',
          },
        },
      },
      {
        label: '任务添加时间',
        key: 'add_time',
        data: {
          type: 'custom',
          render(props: any) {
            return h(VDatePickerRange, {
              modelValue: props.modelValue,
              'onUpdate:modelValue': props['onUpdate:modelValue'],
            });
          },
        },
        range: 2,
      },
    ],
    [
      {
        label: '任务类型',
        key: 'key',
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
      },
      {
        label: '任务状态',
        key: 'status',
        data: {
          type: 'select',
          options: staticOptions.task_status,
          props: {
            clearable: true,
          },
        },
      },
      {
        label: '触发方式',
        key: 'trigger_method',
        data: {
          type: 'select',
          options: staticOptions.task_update_mode,
          props: {
            clearable: true,
          },
        },
      },
    ],
  ],
});

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
      group_name: map[task_key] ?? task_key,
      task_name,
      // detail: JSON.stringify(detail),
      create_timestamp: dayJsformat(create_timestamp, 'YYYY-MM-DD HH:mm:ss'),
      infos,
      status_text: (() => {
        let text = staticMapping.task_status.get(status);
        if (status === 'pending' && !self.running) {
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
const tableRows: TableRow<
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

/** 获取任务分类 */
async function getTypes() {
  const types = await api('/sys/task/types', {});
  taskType.value = types;
}

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
          form: taskForm.value,
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
          form: taskForm.value,
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
      row.self.status !== 'to-be-started' && row.self.status !== 'deleted',
  },
  {
    label: '停止任务',
    method: async ({ row }) => {
      confirm({
        title: '停止当前任务?',
        async confirmCallback() {
          await api('/sys/task/kill', {
            task_id: row.task_id,
          });
          getList(true);
          notify('success', '操作成功');
        },
      });
    },
    icon: IconParkOutlineCloseOne,
    visible: (row) => row.self.status === 'pending',
  },
];

onMounted(async () => {
  await Promise.all([
    getTypes(),
    getList(true),
    httpCache.user.get({ full: true }),
  ]);
});
</script>
