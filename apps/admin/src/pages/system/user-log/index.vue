<template>
  <section v-loading="getListLoading">
    <div class="rounded-b bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="searchColumns"
        @reset="getListDebounce(true)"
        @submit="getListDebounce(true)"
      />
    </div>

    <div class="my-2 rounded bg-white p-4 shadow">
      <v-table :data="tableData" :rows="tableRows">
        <template #detail="{ row }">
          <el-button
            class="p-0!"
            type="primary"
            link
            :loading="getDetailLoading"
            @click="getDetailDebounce(row.self.id)"
          >
            查看操作详情
          </el-button>
        </template>
      </v-table>

      <page-component
        class="mt-4"
        @update:model-value="getListDebounce()"
      ></page-component>
    </div>

    <v-dialog width="80%" title="操作详情" v-model="detailDialog.visible">
      <!-- <v-json-view :json="detailDialog.data"></v-json-view> -->
      <pre class="text-xs">{{ detailDialog.data }}</pre>
    </v-dialog>
  </section>
</template>

<style lang="postcss" scoped></style>

<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef } from 'vue';
import { arrObject, dayJsformat, debounce } from '@repo/utils-browser';
import { api, httpCache, notify } from '@/utils';

import { ElButton } from 'element-plus';
import {
  VDialog,
  VTable,
  // VJsonView,
  VSchemaForm,
  usePage,
  loadingFunc,
} from '@repo/ui';

import type { ApiSys } from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';

type Form = Required<ApiSys.Sys['user-log/list']['req']>['form'];
type LogItem = ApiSys.Sys['user-log/list']['resp']['list'][number];

const typeOptions = shallowRef<{ label: string; value: string }[]>([]);

const actionsMap = computed(() => {
  return arrObject(typeOptions.value, 'value', 'label');
});

const searchForm = shallowRef<Form>({});

const searchColumns: SchemaFormColumn<Form>[] = [
  {
    dataIndex: 'key',
    data: {
      type: 'select',
      options: typeOptions,
      props: {
        clearable: true,
        filterable: true,
        placeholder: '请选择分类',
      },
    },
    title: '分类',
  },
  {
    dataIndex: 'search',
    data: {
      type: 'input',
      props: {
        clearable: true,
        placeholder: '检索: KEY',
      },
    },
    title: '检索KEY',
  },
  {
    dataIndex: 'user_id',
    data: {
      type: 'select',
      /** 加载用户选项，供日志查询按用户筛选。 */
      async options() {
        const items = await httpCache.user.get({ full: true });
        return items.map(({ user_id, nickname, email }) => ({
          label: `${nickname} / ${email ?? '-'}`,
          value: user_id,
        }));
      },
      props: {
        clearable: true,
        filterable: true,
        placeholder: '请选择用户',
      },
    },
    title: '用户',
  },
  {
    dataIndex: 'ip',
    data: {
      type: 'input',
      props: {
        clearable: true,
        placeholder: 'IP地址',
      },
    },
    title: 'IP地址',
  },
  {
    dataIndex: 'timestamp',
    fieldProps: {
      type: 'datetimerange',
    },
    search: {
      collapsed: true,
    },
    title: '操作日期',
    valueType: 'dateRange',
  },
];

const logs = shallowRef<LogItem[]>([]);

const tableData = computed(() => {
  const items = logs.value;
  return items.map((self) => {
    const { ip, user_id, key, timestamp, search_key } = self;
    return {
      ip,
      action: actionsMap.value[key] ?? key,
      timestamp: dayJsformat(timestamp, 'YYYY-MM-DD HH:mm:ss'),
      nickname: user_id
        ? (httpCache.user.mapping.value[user_id]?.nickname ?? user_id)
        : '-',
      search_key,
      self,
    };
  });
});

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
    minWidth: 140,
  },
  {
    label: '姓名',
    value: 'nickname',
    minWidth: 140,
  },
  {
    label: '操作动作',
    value: 'action',
    minWidth: 260,
  },
  {
    label: '检索KEY',
    value: 'search_key',
    minWidth: 200,
  },
  {
    label: '操作日期',
    value: 'timestamp',
    width: 180,
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

      const { count, list } = await api('/sys/user-log/list', {
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
      const [data] = await api('/sys/user-log/detail', {
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
  const options = await api('/sys/user-log/types', {});
  if (options?.length) {
    typeOptions.value = options;
  }
}

onMounted(async () => {
  await Promise.all([getList(true), getTypeOptions()]);
});
</script>
