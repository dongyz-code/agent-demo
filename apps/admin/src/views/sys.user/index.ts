import { computed, defineComponent, onMounted, reactive, ref } from 'vue';
import {
  usePage,
  // VBtn,
  VFormItems,
  VTable,
  VIcon,
  type TableRow,
  type FormItem,
} from '@repo/ui';
import { notify, confirm } from '@/plugins/notify';
import { useStore } from '@/store';
import { api } from '@/api';
import { arrObject, dayJsformat, debounce } from '@repo/utils-browser';
import { staticOptions } from '@/static';
import { httpCache } from '@/cache';
import { storeToRefs } from 'pinia';
import { ElButton, ElSwitch, ElTag } from 'element-plus';

import VOptions from './components/options/index.vue';
import IconParkOutlineEditTwo from '~icons/icon-park-outline/edit-two';
import IconParkOutlineDelete from '~icons/icon-park-outline/delete';

import type { Item, OptionsProps } from './type';
import type { ApiSys } from '@/types';
import type { FunctionalComponent } from 'vue';

type UserItem = ApiSys.UserAction['detail']['resp'][number];
type ApiUserListReq = ApiSys.UserAction['ids']['req'];

/** options, 一定是经过了身份认证 */
function useQueryForm() {
  const getDefaultVal = () => {
    const val: ApiUserListReq['form'] = {};
    return val;
  };

  const form = ref(getDefaultVal());

  const formOptions = computed(() => {
    const list: FormItem<keyof NonNullable<(typeof form)['value']>>[][] = [
      [
        {
          label: '模糊查询',
          data: {
            type: 'input',
            props: {
              placeholder: 'K账户/姓名/邮箱',
              clearable: true,
            },
          },
          key: 'search',
          range: 3,
        },
        {
          label: '账户状态',
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
          label: '角色',
          data: {
            type: 'select',
            options: computed(() => {
              return httpCache.role.selectOptions.value;
            }),
            props: {
              clearable: true,
              filterable: true,
            },
          },
          key: 'role_id',
          range: 3,
        },
      ],
      [
        {
          label: '最后更新日期',
          data: {
            type: 'date-picker',
            props: {
              type: 'daterange',
            },
          },
          key: 'last_update_timestamp',
          range: 3,
        },
        {
          label: '最后登录日期',
          data: {
            type: 'date-picker',
            props: {
              type: 'daterange',
            },
          },
          key: 'last_login_timestamp',
          range: 3,
        },
      ],
    ];
    return list;
  });

  function formClear() {
    form.value = getDefaultVal();
  }

  return {
    form,
    formOptions,
    formClear,
  };
}

function useAndOrUpdate({
  getUserList,
  selectUser,
  users,
}: ReturnType<typeof useUserList>) {
  type Btn = {
    label: string;
    action:
      | 'add-user'
      | 'set-role-to-user'
      | 'ban-user'
      | 'enable-user'
      | 'sync-user';
    method: () => void | Promise<void>;
  };

  /** 表单信息 */
  const optionsData = reactive<
    OptionsProps & {
      action: 'ADD' | 'UPDATE';
    }
  >({
    visible: false,
    data: undefined,
    fields: undefined,
    action: 'ADD',
  });

  function setOptionsData(data: Required<typeof optionsData>) {
    Object.assign(optionsData, data);
  }

  const actions: Btn[] = [
    {
      label: '添加账户',
      action: 'add-user',
      method: () => {
        setOptionsData({
          visible: true,
          data: undefined,
          fields: undefined,
          action: 'ADD',
        });
      },
    },
    {
      label: '批量设置角色',
      action: 'set-role-to-user',
      method: () => {
        const list = selectUser.value.map((x) => x.self);
        if (!list.length) {
          notify('error', '尚未勾选');
          return;
        }
        setOptionsData({
          visible: true,
          data: list.map((x) => ({ ...x, password: null })),
          fields: ['role_id'],
          action: 'UPDATE',
        });
      },
    },
    {
      label: '批量禁用',
      action: 'ban-user',
      method: async () => {
        const list = selectUser.value.map((x) => x.self);
        if (!list.length) {
          notify('error', '尚未勾选');
          return;
        }

        await confirm({
          title: '确认禁用这些用户吗?',
          async confirmCallback() {
            await api('/sys/user/update', {
              id: list.map((x) => x.user_id),
              form: {
                available: false,
              },
            });
            await getUserList(true);
            notify('success', '操作成功');
          },
        });
      },
    },
    {
      label: '批量启用',
      action: 'enable-user',
      method: async () => {
        const list = selectUser.value.map((x) => x.self);
        if (!list.length) {
          notify('error', '尚未勾选');
          return;
        }

        await confirm({
          title: '确认启用这些用户吗?',
          async confirmCallback() {
            await api('/sys/user/update', {
              id: list.map((x) => x.user_id),
              form: {
                available: true,
              },
            });
            await getUserList(true);
            notify('success', '操作成功');
          },
        });
      },
    },
  ];

  async function getForm(form: Item) {
    const { action, data } = optionsData;

    if (action === 'UPDATE') {
      if (!data) {
        notify('error', '数据异常');
        return;
      }
      await api('/sys/user/update', {
        id: Array.isArray(data) ? data.map((x) => x.user_id) : data.user_id,
        form,
      });
      await getUserList(true);
    } else if (action === 'ADD') {
      await api('/sys/user/create', {
        list: [form],
      });
      notify('success', '添加成功');
      await getUserList(true);
    }
    setOptionsData({
      visible: false,
      data: undefined,
      fields: undefined,
      action: 'ADD',
    });
  }

  /** 单用户切换禁用 */
  async function changeLogin(status: any, user_id: string) {
    await api('/sys/user/update', {
      id: user_id,
      form: {
        available: status ? true : false,
      },
    });
    const item = users.value.find((x) => x.user_id === user_id);
    if (item) {
      item.available = status ? true : false;
    }
    notify('success', '状态更新成功');
  }
  /** 单用户编辑 */
  async function singleEdit(item: UserItem) {
    setOptionsData({
      visible: true,
      data: { ...item, password: null },
      fields: undefined,
      action: 'UPDATE',
    });
  }

  async function removeUser(item: UserItem) {
    await confirm({
      title: '确认删除该用户吗?',
    });
    await api('/sys/user/remove', {
      ids: item.user_id,
    });
    await getUserList(true);
    notify('success', '删除成功');
  }

  const tableEditBtns: {
    icon: FunctionalComponent;
    method: (item: UserItem) => Promise<void>;
    tips?: string;
  }[] = [
    {
      icon: IconParkOutlineEditTwo,
      method: singleEdit,
      tips: '编辑',
    },
    {
      icon: IconParkOutlineDelete,
      method: removeUser,
      tips: '删除',
    },
  ];

  return {
    optionsData,
    actions,
    tableEditBtns,
    getForm,
    changeLogin,
    singleEdit,
  };
}

const { user, permission } = storeToRefs(useStore());

function useUserList() {
  const { pageData, pageRange, setPageData, pageComponent } = usePage({
    page: { size: 50 },
  });
  const users = ref<UserItem[]>([]);
  const selectUser = ref<typeof cUsers.value>([]);

  const useQueryFormRes = useQueryForm();

  const roleNameMap = computed(() => {
    return arrObject(httpCache.role.selectOptions.value, 'value', 'label');
  });

  const cUsers = computed(() => {
    return users.value.map((self) => {
      const {
        user_id,
        nickname,
        email,
        available,
        role_id,
        username,
        last_update_timestamp,
      } = self;
      const roles = role_id.map((value) => ({
        value,
        label: roleNameMap.value[value],
      }));
      return {
        self: { ...self, role_id },
        user_id: user_id,
        nickname,
        username,
        email,
        roles,
        available,
        timestamp: dayJsformat(last_update_timestamp, 'YYYY-MM-DD HH:mm:ss'),
      };
    });
  });

  const rows = computed<
    TableRow<keyof (typeof cUsers)['value'][number] | 'edit'>[]
  >(() => {
    return [
      {
        type: 'selection',
      },
      {
        value: 'nickname',
        label: '姓名',
        minWidth: 40,
      },
      {
        value: 'username',
        label: '账户',
        minWidth: 40,
      },
      {
        value: 'email',
        label: '邮箱',
        minWidth: 60,
      },
      {
        slot: 'roles',
        label: '角色',
        minWidth: 60,
      },
      {
        label: '账户状态',
        slot: 'available',
        width: 80,
      },
      {
        value: 'timestamp',
        label: '更新日期',
        width: 160,
      },
      {
        slot: 'edit',
        label: '编辑',
        width: 80,
      },
    ];
  });

  function select(e: typeof cUsers.value) {
    selectUser.value = e;
  }

  async function getUserList(withCount?: boolean) {
    const { ids, count } = await api('/sys/user/ids', {
      limit: pageRange.value,
      withCount: withCount === true,
      form: useQueryFormRes.form.value,
    });

    if (ids.length > 0) {
      const data = await api('/sys/user/detail', {
        ids: ids,
      });
      users.value = data;
    } else {
      users.value = [];
    }

    if (withCount === true) {
      setPageData({ total: count });
    }
  }

  async function reset() {
    useQueryFormRes.formClear();
    await getUserList(true);
  }

  const getUserListDebounce = debounce(getUserList, 500);

  onMounted(() => {
    getUserList(true);
    httpCache.role.get({ full: true, refresh: true });
  });

  return {
    permission,
    rows,
    users,
    cUsers,
    selectUser,
    user,
    pageData,
    pageComponent,
    select,
    getUserList,
    getUserListDebounce,
    reset,
    ...useQueryFormRes,
  };
}

export const setup = defineComponent({
  components: {
    VFormItems,
    VTable,
    VIcon,
    // VBtn,
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
