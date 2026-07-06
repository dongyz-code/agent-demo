import {
  computed,
  defineComponent,
  onMounted,
  reactive,
  ref,
  type FunctionalComponent,
} from 'vue';
import { usePage, VIcon, VTable, VSchemaForm } from '@repo/ui';
import { api, confirm, notify } from '@/utils';
import { useStore } from '@/models';
import { adminPermissionKey } from '@repo/shared/permission';
import { dayJsformat, debounce } from '@repo/utils-browser';
import { staticOptions } from '@/constants';
import { ElButton, ElSwitch, ElTag } from 'element-plus';

import VOptions from './components/options/index.vue';

import IconParkOutlineEditTwo from '~icons/icon-park-outline/edit-two';
import IconParkOutlineDelete from '~icons/icon-park-outline/delete';

import type { ApiSys } from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';
import type { Item } from './components/options/index';

type RoleItem = ApiSys.RoleAction['detail']['resp'][number];
type ApiRoleListReq = ApiSys.RoleAction['ids']['req'];

/** 角色管理页使用的操作权限 key，集中声明避免按钮和提交逻辑散落字符串。 */
const roleActionPermission = {
  assignPermission: adminPermissionKey('actions.role.assign-permission'),
  create: adminPermissionKey('actions.role.create'),
  remove: adminPermissionKey('actions.role.delete'),
  toggle: adminPermissionKey('actions.role.toggle'),
  update: adminPermissionKey('actions.role.update'),
} as const;

function useQueryForm() {
  type Form = NonNullable<ApiRoleListReq['form']>;

  const form = ref<Form>({});

  const formColumns: SchemaFormColumn<Form>[] = [
    {
      dataIndex: 'search',
      fieldProps: {
        clearable: true,
        placeholder: '角色名称/角色描述',
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
        },
      },
      dataIndex: 'available',
      title: '角色状态',
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

  function formClear() {
    form.value = {};
  }

  return {
    form,
    formColumns,
    formClear,
  };
}

/**
 * 管理角色列表页的新增、编辑、授权、启停和删除动作。
 *
 * @param options.getRoleList 刷新角色列表的方法。
 * @param options.roles 当前页面持有的角色列表，用于启停后同步本地状态。
 * @returns 角色操作弹窗状态、权限状态和表格操作入口。
 */
function useRoleActions(options: ReturnType<typeof useUserList>) {
  const { getRoleList, roles } = options;
  const store = useStore();
  type Btn = {
    label: string;
    action: 'add';
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

  /** 当前用户在角色管理页的操作权限集合，模板和提交逻辑共用同一份判断。 */
  const access = computed(() => {
    const update = store.hasPermission(roleActionPermission.update);
    const assignPermission = store.hasPermission(
      roleActionPermission.assignPermission,
    );

    return {
      assignPermission,
      create: store.hasPermission(roleActionPermission.create),
      editBase: optionsData.role === 'add' || update,
      openEditor: update || assignPermission,
      remove: store.hasPermission(roleActionPermission.remove),
      toggle: store.hasPermission(roleActionPermission.toggle),
      update,
    };
  });

  const dialogTitle = computed(() =>
    optionsData.role === 'add' ? '新增角色' : '编辑角色',
  );

  const actions = computed<Btn[]>(() =>
    access.value.create
      ? [
          {
            label: '添加角色',
            action: 'add',
            method: () => {
              optionsData.role = 'add';
              optionsData.data = undefined;
              optionsData.visible = true;
            },
          },
        ]
      : [],
  );

  /**
   * 提交角色新增或编辑表单。
   *
   * @param form 弹窗中校验后的角色表单数据。
   * @returns 保存成功后刷新列表并关闭弹窗。
   */
  async function submitRoleForm(form: Item) {
    const { name, desc, permission } = form;
    if (optionsData.role === 'update') {
      const updateForm: Partial<Item> = {};
      if (access.value.update) {
        updateForm.name = name;
        updateForm.desc = desc;
      }
      if (access.value.assignPermission) {
        updateForm.permission = permission;
      }
      if (!Object.keys(updateForm).length) {
        return notify('error', '没有可提交的角色权限');
      }
      await api('/sys/role/update', {
        id: optionsData.data!.role_id!,
        form: updateForm,
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
            permission: access.value.assignPermission ? permission : [],
          },
        ],
      });
      notify('success', '添加成功');
      await getRoleList(true);
    }
    optionsData.formKey = Date.now() + '';
    optionsData.visible = false;
  }

  /**
   * 切换角色启用状态。
   *
   * @param status 目标启用状态。
   * @param role_id 待更新的角色 ID。
   * @returns 更新成功后同步当前列表中的角色状态。
   */
  async function toggleRoleStatus(status: boolean, role_id: string) {
    if (!access.value.toggle) {
      return notify('error', '没有启停角色权限');
    }
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

  /**
   * 打开角色编辑或授权弹窗。
   *
   * @param item 当前表格行对应的角色。
   * @returns void。
   */
  async function openRoleEditor(item: RoleItem) {
    if (!access.value.openEditor) {
      return notify('error', '没有编辑或授权角色权限');
    }
    optionsData.role = 'update';
    optionsData.data = item;
    optionsData.visible = true;
  }

  /**
   * 删除单个角色。
   *
   * @param item 当前表格行对应的角色。
   * @returns 删除成功后刷新角色列表。
   */
  async function removeRole(item: RoleItem) {
    if (!access.value.remove) {
      return notify('error', '没有删除角色权限');
    }
    await confirm({
      title: '确定删除该角色吗？',
    });
    await api('/sys/role/remove', {
      ids: item.role_id,
    });
    await getRoleList(true);
    notify('success', '删除成功');
  }

  const tableEditBtns = computed<{
    icon: FunctionalComponent;
    method: (item: RoleItem) => Promise<unknown>;
    tips?: string;
  }[]>(() => [
    ...(access.value.openEditor
      ? [
          {
            icon: IconParkOutlineEditTwo,
            method: openRoleEditor,
            tips: '编辑/授权',
          },
        ]
      : []),
    ...(access.value.remove
      ? [
          {
            icon: IconParkOutlineDelete,
            method: removeRole,
            tips: '删除',
          },
        ]
      : []),
  ]);

  return {
    optionsData,
    actions,
    submitRoleForm,
    toggleRoleStatus,
    tableEditBtns,
    access,
    dialogTitle,
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
    VSchemaForm,
    VOptions,
    ElButton,
    ElSwitch,
    ElTag,
  },
  setup() {
    const useUserListRes = useUserList();
    return {
      ...useUserListRes,
      ...useRoleActions(useUserListRes),
    };
  },
});
