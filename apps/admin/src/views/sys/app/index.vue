<template>
  <section>
    <div class="rounded-b bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="searchColumns"
        :layout="{ labelWidth: '72px' }"
        @reset="getListDebounce(true)"
        @submit="getListDebounce(true)"
      />
    </div>

    <div class="mt-4 grid grid-cols-6 gap-4">
      <div
        class="relative flex aspect-square cursor-pointer flex-col overflow-hidden rounded bg-white shadow"
        v-for="{ id, self, status } in cData"
        :key="id"
      >
        <template v-if="self">
          <div
            class="scroll-bar relative h-full overflow-x-hidden overflow-y-auto"
          >
            <div
              class="sticky top-0 z-1 overflow-hidden border-b border-gray-200 bg-white p-3 font-bold"
              :title="self.name"
            >
              <div class="line-clamp-1 text-sm">{{ self.name }}</div>
            </div>
            <div class="px-3 py-2 text-xs opacity-80">{{ self.desc }}</div>
          </div>
          <div
            class="flex items-center justify-between border-t border-gray-200 bg-white px-3 py-2"
          >
            <div class="flex gap-3">
              <v-icon
                v-for="item in actionList"
                :key="item.action"
                class="text-primary text-lg hover:opacity-70"
                :icon="item.icon"
                :tips="item.label"
                @click="actionM(item.action, self)"
              />
            </div>
            <el-switch
              :model-value="status"
              @update:model-value="toggle(self, Boolean($event))"
            />
          </div>
        </template>

        <template v-else>
          <div
            @click="setDialog({ add: true })"
            class="text-primary flex h-full w-full items-center justify-center"
          >
            <v-icon class="text-4xl" :icon="create.icon" :tips="create.tips" />
          </div>
        </template>
      </div>
    </div>

    <page-component
      class="mt-4"
      v-if="pageData.total < pageData.size"
      @update:model-value="getListDebounce()"
    />

    <v-dialog title="编辑" v-model="form.visible">
      <v-form-items v-model="form.data" :options="formOptions" />
      <template #footer>
        <el-button type="primary" @click="handleConfirm"> 确认 </el-button>
        <el-button @click="form.visible = false">取消</el-button>
      </template>
    </v-dialog>
  </section>
</template>

<style lang="postcss" scoped></style>

<script setup lang="ts">
import { computed, reactive, onMounted, ref } from 'vue';
import { copyText, getKeys, debounce } from '@repo/utils-browser';
import { api } from '@/api';
import { notify, confirm } from '@/plugins/notify';
import { ElSwitch, ElButton } from 'element-plus';
import { VDialog, VFormItems, VIcon, VSchemaForm, usePage } from '@repo/ui';
import { staticOptions } from '@/static';

import IconParkOutlinePlus from '~icons/icon-park-outline/plus';
import IconParkOutlineEditTwo from '~icons/icon-park-outline/edit-two';
import IconParkOutlineCopy from '~icons/icon-park-outline/copy';
import IconParkOutlineDelete from '~icons/icon-park-outline/delete';

import type { FormItem, IconType, SchemaFormColumn } from '@repo/ui';
import type { ApiSys } from '@/types';

type Items = ApiSys.AppAction['detail']['resp'];
type ApiAppListReq = ApiSys.AppAction['ids']['req'];
type SearchForm = NonNullable<ApiAppListReq['form']>;

const create = {
  icon: IconParkOutlinePlus,
  tips: '创建接口',
};

const searchForm = ref<SearchForm>({});

const searchColumns: SchemaFormColumn<SearchForm>[] = [
  {
    dataIndex: 'search',
    fieldProps: {
      clearable: true,
      placeholder: '接口名称 / 接口描述',
    },
    title: '模糊查询',
    valueType: 'text',
  },
  {
    data: {
      type: 'select',
      options: staticOptions.available,
      props: {
        clearable: true,
        filterable: true,
      },
    },
    dataIndex: 'available',
    title: '接口状态',
  },
  {
    dataIndex: 'last_update_timestamp',
    fieldProps: {
      clearable: true,
    },
    title: '更新日期',
    valueType: 'dateRange',
  },
];

const { pageData, pageRange, setPageData, pageComponent } = usePage({
  page: { size: 50 },
});

const data = ref<Items>([]);

async function getList(withCount?: boolean) {
  const { ids, count } = await api('/sys/app/ids', {
    form: searchForm.value,
    limit: pageRange.value,
    withCount: withCount === true,
  });
  if (ids.length) {
    const result = await api('/sys/app/detail', {
      ids,
    });
    data.value = result;
  } else {
    data.value = [];
  }
  if (withCount === true) {
    setPageData({ total: count });
  }
}

const getListDebounce = debounce(getList, 1000);

const cData = computed(() => {
  return [
    ...data.value.map((self) => ({
      self,
      id: self.id,
      status: self.available,
    })),
    {
      id: -1,
      self: null,
      status: false,
    },
  ];
});

onMounted(() => {
  getList(true);
});

const form: {
  visible: boolean;
  data: {
    name: string;
    desc: string;
  };
  id?: number;
  status: 'add' | 'update';
} = reactive({
  visible: false,
  data: {
    name: '',
    desc: '',
  },
  status: 'add',
});

const formOptions: FormItem<keyof (typeof form)['data']>[][] = [
  [
    {
      label: '名称',
      key: 'name',
      required: true,
      data: {
        type: 'input',
      },
    },
  ],
  [
    {
      label: '简介',
      key: 'desc',
      required: true,
      data: {
        type: 'input',
        props: {
          type: 'textarea',
          autosize: {
            minRows: 3,
            maxRows: 3,
          },
        },
      },
    },
  ],
];

function setDialog(
  data: { add: true } | { id: number; update: { name: string; desc: string } },
) {
  if ('add' in data) {
    form.status = 'add';
    form.data = {
      name: '',
      desc: '',
    };
    form.visible = true;
  } else {
    form.status = 'update';
    form.data = {
      name: data.update.name,
      desc: data.update.desc,
    };
    form.id = data.id;
    form.visible = true;
  }
}

async function handleConfirm() {
  const { id, data, status } = form;

  let { name, desc } = data;
  name = name.trim();
  desc = desc.trim();
  if (!name) {
    notify('warning', '请完善接口信息');
    return;
  }

  const item = {
    name,
    desc,
  };
  if (status === 'add') {
    await api('/sys/app/create', item);
    await getList(true);
    notify('success', '创建成功');
    form.visible = false;
  } else if (status === 'update') {
    await api('/sys/app/update', {
      id: id!,
      update: item,
    });
    await getList(true);
    notify('success', '更新成功');
    form.visible = false;
  }
}

function helper<
  T extends Record<
    string,
    {
      label: string;
      icon: IconType;
    }
  >,
>(data: T) {
  return data;
}

const actions = helper({
  eidt: {
    label: '编辑',
    icon: IconParkOutlineEditTwo,
  },
  copy: {
    label: '复制 client_id / client_secret',
    icon: IconParkOutlineCopy,
  },
  remove: {
    label: '移除',
    icon: IconParkOutlineDelete,
  },
});

const actionList = getKeys(actions).map((action) => ({
  action,
  ...actions[action],
}));

async function actionM(
  key: keyof typeof actions,
  item: (typeof data.value)[number],
) {
  if (key === 'remove') {
    await confirm({
      title: '确认删除？',
      async confirmCallback() {
        await api('/sys/app/remove', { ids: item.id });
        await getList(true);
        notify('success', '删除成功');
      },
    });
  } else if (key === 'copy') {
    copyText(`${item['client_id']}  /  ${item['client_secret']}`);
    notify('success', 'client_id / client_secret 已复制到剪切板');
  } else if (key === 'eidt') {
    setDialog({
      update: {
        name: item.name,
        desc: item.desc || '',
      },
      id: item.id,
    });
  }
}

async function toggle(item: (typeof data.value)[number], status: boolean) {
  await api('/sys/app/update', {
    id: item.id,
    update: {
      available: status,
    },
  });
  const active = data.value.find((self) => self.id === item.id);
  if (active) {
    active.available = status;
  }
  notify('success', '更新成功');
}
</script>
