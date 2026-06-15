<template>
  <section v-loading="getListLoading">
    <div class="rounded-b bg-white p-4 shadow">
      <search-component
        @update:model-value="getListDebounce(true)"
      ></search-component>
    </div>

    <div class="my-2 rounded bg-white p-4 shadow">
      <v-table :data="tableData" :rows="tableRows">
        <template #status="{ row }">
          <div v-if="row.status" class="flex items-center">
            <TablerPointFilled
              class="text-xl"
              :style="{
                color: row.status?.color,
              }"
            />
            <span> {{ row.status?.text }} </span>
          </div>
          <span class="ml-2" v-else>-</span>
        </template>
        <template #detail="{ row }">
          <el-button
            class="p-0!"
            type="primary"
            link
            :loading="getDetailLoading"
            @click="getDetailDebounce(row.self.id)"
          >
            查看日志详情
          </el-button>
        </template>
      </v-table>

      <page-component
        class="mt-4"
        @update:model-value="getListDebounce()"
      ></page-component>
    </div>

    <v-dialog width="80%" title="日志详情" v-model="detailDialog.visible">
      <!-- <v-json-view :json="detailDialog.data"></v-json-view> -->
      <pre class="text-xs">{{ detailDialog.data }}</pre>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import { reactive, shallowRef, computed, onMounted, h } from 'vue';
import { dayJsformat, debounce } from '@repo/utils-browser';
import { api } from '@/api';
import { staticMapping, staticOptions } from '@/static';
import { httpCache, handleSelectUserLabel } from '@/cache';
import { notify } from '@/plugins/notify';

import {
  VDialog,
  VTable,
  VDatePickerRange,
  useFormItems,
  loadingFunc,
  usePage,
} from '@repo/ui';
import { ElButton } from 'element-plus';

import TablerPointFilled from '~icons/tabler/point-filled';

import type { TableRow } from '@repo/ui';
import type { ApiSys } from '@/types';

type Form = Required<ApiSys.Sys['api-log/list']['req']>['form'];
type LogItem = ApiSys.Sys['api-log/list']['resp']['list'][number];

const typeOptions = shallowRef<{ label: string; value: string }[]>([]);

const { searchComponent, searchForm } = useFormItems<Form, 'search'>({
  prefix: 'search',
  form: {},
  options: [
    [
      {
        label: '',
        data: {
          type: 'select',
          options: staticOptions.interface_mode,
          props: {
            clearable: true,
            filterable: true,
            placeholder: '模式',
          },
        },
        key: 'mode',
      },
      {
        label: '',
        data: {
          type: 'select',
          options: typeOptions,
          props: {
            clearable: true,
            filterable: true,
            placeholder: '通信标识',
          },
        },
        key: 'client_mark',
      },
      {
        label: '',
        data: {
          type: 'select',
          options: staticOptions.interface_status,
          props: {
            clearable: true,
            filterable: true,
            placeholder: '状态',
          },
        },
        key: 'status',
      },
      {
        label: '操作日期',
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
        key: 'start_timestamp',
      },
    ],
    [
      {
        label: '',
        data: {
          type: 'input',
          props: {
            clearable: true,
            placeholder: '检索: KEY',
          },
        },
        key: 'search',
      },
      {
        label: '',
        data: {
          type: 'input',
          props: {
            clearable: true,
            placeholder: '请求URL',
          },
        },
        key: 'url',
      },
      {
        label: '',
        data: {
          type: 'input',
          props: {
            clearable: true,
            placeholder: 'IP地址',
          },
        },
        key: 'ip',
      },
      {
        label: '',
        data: {
          type: 'input',
          props: {
            clearable: true,
            placeholder: '应用ID',
          },
        },
        key: 'client_id',
      },
      {
        label: '',
        data: {
          type: 'select',
          options: async () => {
            const items = await httpCache.user.get({ full: true });
            return handleSelectUserLabel(items);
          },
          props: {
            clearable: true,
            filterable: true,
            placeholder: '用户',
          },
        },
        key: 'user_id',
      },
    ],
  ],
});

const logs = shallowRef<LogItem[]>([]);

const tableData = computed(() => {
  const items = logs.value;
  return items.map((self) => {
    const {
      mode,
      client_id,
      client_mark,
      ip,
      user_id,
      status,
      start_timestamp,
      end_timestamp,
      duration,
      search_key,
      url,
    } = self;

    return {
      mode: staticMapping.interface_mode.get(mode),
      client_id,
      client_mark,
      ip,
      user_id,
      status: status
        ? {
            text: staticMapping.interface_status.get(status),
            color: colorMap[status],
          }
        : undefined,
      start_date: dayJsformat(start_timestamp, 'YYYY-MM-DD HH:mm:ss'),
      end_date: end_timestamp
        ? dayJsformat(end_timestamp, 'YYYY-MM-DD HH:mm:ss')
        : '-',
      duration,
      search_key,
      url: url?.split('?')[0],
      self,
    };
  });
});

const colorMap: Record<NonNullable<LogItem['status']>, string> = {
  pending: 'var(--color-yellow-500)',
  completed: 'var(--color-green-500)',
  failed: 'var(--color-red-500)',
};

const tableRows: TableRow<
  keyof (typeof tableData)['value'][number] | 'detail'
>[] = [
  {
    label: '序号',
    type: 'index',
    width: 80,
  },
  {
    label: 'IP地址',
    value: 'ip',
  },
  {
    label: '模式',
    value: 'mode',
  },
  {
    label: '通信标识',
    value: 'client_mark',
  },
  {
    label: '检索KEY',
    value: 'search_key',
    minWidth: 100,
  },
  {
    label: '请求URL',
    value: 'url',
    minWidth: 120,
  },
  {
    label: '应用ID',
    value: 'client_id',
  },
  {
    label: '用户',
    value: 'user_id',
  },
  {
    label: '状态',
    slot: 'status',
  },
  {
    label: '开始日期',
    value: 'start_date',
    width: 180,
  },
  {
    label: '结束日期',
    value: 'end_date',
    width: 180,
  },
  {
    label: '响应时长',
    value: 'duration',
  },
  {
    label: '查看详情',
    slot: 'detail',
  },
];

/** 分页组件 */
const { pageComponent, setPageData, pageRange } = usePage({
  props: {
    align: 'center',
  },
  page: {
    size: 50,
  },
});

const { getList, getListLoading } = loadingFunc({
  funcs: {
    async getList(withCount?: boolean) {
      if (withCount) {
        setPageData({ current: 1 });
      }

      const { count, list } = await api('/sys/api-log/list', {
        withCount,
        limit: pageRange.value,
        form: searchForm.value,
      });
      if (withCount) {
        setPageData({ total: count });
      }

      logs.value = list;
    },
  },
});

const getListDebounce = debounce(getList);

const detailDialog = reactive<{ visible: boolean; data: any }>({
  visible: false,
  data: undefined,
});

const { getDetail, getDetailLoading } = loadingFunc({
  funcs: {
    async getDetail(id: string) {
      const [data] = await api('/sys/api-log/detail', {
        ids: [id],
      });

      if (data?.detail) {
        detailDialog.data = JSON.parse(data.detail);
        detailDialog.visible = true;
      } else {
        notify('error', '暂无数据');
      }
    },
  },
});

const getDetailDebounce = debounce(getDetail);

async function getTypeOptions() {
  const options = await api('/sys/api-log/types', {});
  if (options?.length) {
    typeOptions.value = options;
  }
}

onMounted(async () => {
  await Promise.all([getList(true), getTypeOptions()]);
});
</script>
