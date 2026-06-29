/**
 * admin 权限树。
 *
 * 这是权限的唯一手写数据源。父节点、页面入口和具体操作都只是树节点；
 * route meta 和 routeHandler 都直接引用这里的 key。
 */
export const adminPermissionTree = [
  {
    key: 'pages',
    label: '页面入口',
    children: [
      {
        key: 'pages.sys',
        label: '系统管理',
        children: [
          {
            key: 'pages.sys.sys.user',
            label: '用户管理',
            route: 'sys.user',
          },
          {
            key: 'pages.sys.sys.role',
            label: '角色管理',
            route: 'sys.role',
          },
          {
            key: 'pages.sys.sys.app',
            label: '接口管理',
            route: 'sys.app',
          },
          {
            key: 'pages.sys.sys.app-log',
            label: '接口日志',
            route: 'sys.app-log',
          },
          {
            key: 'pages.sys.sys.user-log',
            label: '操作日志',
            route: 'sys.user-log',
          },
          {
            key: 'pages.sys.sys.task',
            label: '任务管理',
            route: 'sys.task',
          },
          {
            key: 'pages.sys.sys.table',
            label: '表管理',
            route: 'sys.table',
          },
        ],
      },
    ],
  },
  {
    key: 'actions',
    label: '功能操作',
    children: [
      {
        key: 'actions.role',
        label: '角色管理',
        children: [
          {
            key: 'actions.role.create',
            label: '新增角色',
          },
          {
            key: 'actions.role.update',
            label: '编辑基础信息',
          },
          {
            key: 'actions.role.assign-permission',
            label: '修改角色授权',
          },
          {
            key: 'actions.role.toggle',
            label: '启停角色',
          },
          {
            key: 'actions.role.delete',
            label: '删除角色',
          },
        ],
      },
      {
        key: 'actions.user',
        label: '用户管理',
        children: [
          {
            key: 'actions.user.create',
            label: '新增用户',
          },
          {
            key: 'actions.user.update',
            label: '编辑用户',
          },
          {
            key: 'actions.user.assign-role',
            label: '分配角色',
          },
          {
            key: 'actions.user.toggle',
            label: '启停用户',
          },
          {
            key: 'actions.user.delete',
            label: '删除用户',
          },
        ],
      },
      {
        key: 'actions.app',
        label: '接口管理',
        children: [
          {
            key: 'actions.app.create',
            label: '新增接口',
          },
          {
            key: 'actions.app.update',
            label: '编辑接口',
          },
          {
            key: 'actions.app.toggle',
            label: '启停接口',
          },
          {
            key: 'actions.app.refresh-secret',
            label: '刷新密钥',
          },
          {
            key: 'actions.app.delete',
            label: '删除接口',
          },
        ],
      },
      {
        key: 'actions.task',
        label: '任务管理',
        children: [
          {
            key: 'actions.task.add',
            label: '手动添加任务',
          },
          {
            key: 'actions.task.kill',
            label: '终止任务',
          },
          {
            key: 'actions.task.schedule',
            label: '调度启停',
          },
        ],
      },
      {
        key: 'actions.setting',
        label: '系统设置',
        children: [
          {
            key: 'actions.setting.set',
            label: '修改设置',
          },
        ],
      },
      {
        key: 'actions.log',
        label: '日志详情',
        children: [
          {
            key: 'actions.user-log.detail',
            label: '查看操作日志详情',
          },
          {
            key: 'actions.api-log.detail',
            label: '查看接口日志详情',
          },
        ],
      },
      {
        key: 'actions.table',
        label: '表管理',
        children: [
          {
            key: 'actions.table.view',
            label: '查看表清单',
          },
          {
            key: 'actions.table.preview',
            label: '查看 Demo 数据',
          },
          {
            key: 'actions.table.rename',
            label: '重命名表结构',
          },
          {
            key: 'actions.table.reset',
            label: '根据 schema 重置',
          },
        ],
      },
    ],
  },
] as const;
