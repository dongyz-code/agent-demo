import {
  computed,
  defineComponent,
  onMounted,
  reactive,
  ref,
  type FunctionalComponent,
} from 'vue';
import { usePage, VIcon, VTable, VFormItems } from '@repo/ui';
import { notify, confirm } from '@/plugins/notify';
import { useStore } from '@/store';
import { api } from '@/api';
import { dayJsformat, debounce } from '@repo/utils-browser';
import { staticOptions } from '@/static';
import { ElButton, ElSwitch, ElTag } from 'element-plus';

import VOptions from './components/options/index.vue';

import IconParkOutlineEditTwo from '~icons/icon-park-outline/edit-two';
import IconParkOutlineDelete from '~icons/icon-park-outline/delete';

import type { ApiSys } from '@/types';
import type { FormItem, TableRow } from '@repo/ui';
import type { Item } from './components/options/index';

type RoleItem = ApiSys.RoleAction['detail']['resp'][number];
type ApiRoleListReq = ApiSys.RoleAction['ids']['req'];

function useQueryForm() {
  const form = ref<ApiRoleListReq['form']>({});

  const formOptions: FormItem<keyof NonNullable<ApiRoleListReq['form']>>[][] = [
    [
      {
        label: '模糊查询',
        data: {
          type: 'input',
          props: {
            placeholder: '角色名称/角色描述',
            clearable: true,
          },
        },
        key: 'search',
        range: 3,
      },
      {
        label: '角色状态',
        data: {
          type: 'select',
          options: staticOptions.available,
          props: {
            clearable: true,
          },
        },
        key: 'available',
        range: 3,
      },
      {
        label: '更新日期',
        data: {
          type: 'date-picker',
          props: {
            type: 'daterange',
          },
        },
        key: 'last_update_timestamp',
        range: 3,
      },
    ],
  ];

  function formClear() {
    form.value = {};
  }

  return {
    form,
    formOptions,
    formClear,
  };
}

function useAndOrUpdate({
  getRoleList,
  roles,
}: ReturnType<typeof useUserList>) {
  type Btn = {
    label: string;
    action: 'add-internal' | 'add-external';
    method: () => void | Promise<void>;
  };

  /** 表单信息 */
  const optionsData = reactive({
    visible: false,
    /** update 缓存之前的数据 */
    data: undefined as RoleItem | undefined,
    role: 'add' as 'add' | 'update',
    /** 成功操作后更新 key，清除缓存 */
    formKey: Date.now() + '',
  });

  const actions: Btn[] = [
    {
      label: `添加角色`,
      action: 'add-internal',
      method: () => {
        optionsData.role = 'add';
        optionsData.data = undefined;
        optionsData.visible = true;
      },
    },
  ];

  async function getForm(form: Item) {
    const { name, desc, permission } = form;
    if (optionsData.role === 'update') {
      await api('/sys/role/update', {
        id: optionsData.data!.role_id!,
        form: {
          name,
          desc,
          permission,
        },
      });
      await getRoleList(true);
      notify('success', '更新成功');
    } else if (optionsData.role === 'add') {
      /** 新增 */
      await api('/sys/role/create', {
        list: [
          {
            name,
            desc,
            permission,
          },
        ],
      });
      notify('success', '添加成功');
      await getRoleList(true);
    }
    optionsData.formKey = Date.now() + '';
    optionsData.visible = false;
  }

  /** 单用户切换禁用 */
  async function changeLogin(status: boolean, role_id: string) {
    await api('/sys/role/update', {
      id: role_id,
      form: {
        available: status,
      },
    });
    const item = roles.value.find((x) => x.role_id === role_id);
    if (item) {
      item.available = status;
    }
    notify('success', '状态更新成功');
  }

  /** 单用户编辑 */
  async function singleEdit(item: RoleItem) {
    optionsData.role = 'update';
    optionsData.data = item;
    optionsData.visible = true;
  }

  /** 单用户编辑 */
  async function singleRemove(item: RoleItem) {
    await confirm({
      title: '确定删除该角色吗？',
    });
    await api('/sys/role/remove', {
      ids: item.role_id,
    });
    await getRoleList(true);
    notify('success', '删除成功');
  }

  const tableEditBtns: {
    icon: FunctionalComponent;
    method: (item: RoleItem) => Promise<void>;
    tips?: string;
  }[] = [
    {
      icon: IconParkOutlineEditTwo,
      method: singleEdit,
      tips: '编辑',
    },
    {
      icon: IconParkOutlineDelete,
      method: singleRemove,
      tips: '删除',
    },
  ];

  return {
    optionsData,
    actions,
    getForm,
    changeLogin,
    tableEditBtns,
  };
}

function useUserList() {
  const { user } = useStore();
  const { pageData, pageRange, setPageData, pageComponent } = usePage({
    page: { size: 50 },
  });
  const roles = ref<RoleItem[]>([]);

  const useQueryFormRes = useQueryForm();

  const cRoles = computed(() => {
    return roles.value.map((self) => {
      const { name, desc, create_timestamp, available, last_update_timestamp } =
        self;
      return {
        self,
        name,
        desc,
        available,
        timestamp: dayJsformat(last_update_timestamp, 'YYYY-MM-DD HH:mm:ss'),
        create_date: dayJsformat(create_timestamp, 'YYYY-MM-DD HH:mm:ss'),
      };
    });
  });

  const rows = computed<
    TableRow<keyof (typeof cRoles)['value'][number] | 'edit'>[]
  >(() => {
    return [
      {
        value: 'name',
        label: '角色名称',
        width: 200,
      },
      {
        value: 'desc',
        label: '角色描述',
        minWidth: 100,
      },
      {
        value: 'create_date',
        label: '创建时间',
        width: 160,
      },
      {
        value: 'timestamp',
        label: '更新时间',
        width: 160,
      },
      {
        label: '角色状态',
        slot: 'available',
        width: 80,
      },
      {
        slot: 'edit',
        label: '编辑',
        width: 100,
      },
    ];
  });

  async function getRoleList(withCount?: boolean) {
    const [{ ids, count }] = await Promise.all([
      api('/sys/role/ids', {
        limit: pageRange.value,
        withCount: withCount === true,
        form: useQueryFormRes.form.value,
      }),
    ]);

    if (ids.length > 0) {
      const data = await api('/sys/role/detail', {
        ids: ids,
      });
      roles.value = data;
    } else {
      roles.value = [];
    }

    if (withCount === true) {
      setPageData({ total: count });
    }
  }

  async function reset() {
    useQueryFormRes.formClear();
    await getRoleList(true);
  }

  const getRoleListDebounce = debounce(getRoleList, 500);

  onMounted(() => {
    getRoleList(true);
  });

  return {
    rows,
    roles,
    cRoles,
    user,
    pageData,
    getRoleList,
    getRoleListDebounce,
    reset,
    pageComponent,
    ...useQueryFormRes,
  };
}

export const setup = defineComponent({
  components: {
    VIcon,
    VTable,
    VFormItems,
    VOptions,
    ElButton,
    ElSwitch,
    ElTag,
  },
  setup() {
    const useUserListRes = useUserList();
    return {
      ...useUserListRes,
      ...useAndOrUpdate(useUserListRes),
    };
  },
});
