/**
 * admin 权限树。
 *
 * 这是权限的唯一手写数据源。分组、页面入口和按钮操作都在这棵树里表达；
 * route meta、routeHandler 和角色授权弹窗都直接引用这里的 key。
 */
export const adminPermissionTree = [
  {
    key: 'pages',
    label: '页面',
    type: 'group',
    icon: 'layout',
    children: [
      {
        key: 'pages.sys',
        label: '系统管理',
        type: 'group',
        icon: 'settings',
        children: [
          {
            key: 'pages.sys.sys.user',
            label: '用户管理',
            type: 'page',
            icon: 'user',
            route: 'sys.user',
            children: [
              {
                key: 'actions.user.create',
                label: '新增用户',
                type: 'button',
                icon: 'plus',
              },
              {
                key: 'actions.user.update',
                label: '编辑用户',
                type: 'button',
                icon: 'edit',
              },
              {
                key: 'actions.user.assign-role',
                label: '分配角色',
                type: 'button',
                icon: 'link',
              },
              {
                key: 'actions.user.toggle',
                label: '启停用户',
                type: 'button',
                icon: 'power',
              },
              {
                key: 'actions.user.delete',
                label: '删除用户',
                type: 'button',
                icon: 'trash',
              },
            ],
          },
          {
            key: 'pages.sys.sys.role',
            label: '角色管理',
            type: 'page',
            icon: 'shield',
            route: 'sys.role',
            children: [
              {
                key: 'actions.role.create',
                label: '新增角色',
                type: 'button',
                icon: 'plus',
              },
              {
                key: 'actions.role.update',
                label: '编辑基础信息',
                type: 'button',
                icon: 'edit',
              },
              {
                key: 'actions.role.assign-permission',
                label: '修改角色授权',
                type: 'button',
                icon: 'key',
              },
              {
                key: 'actions.role.toggle',
                label: '启停角色',
                type: 'button',
                icon: 'power',
              },
              {
                key: 'actions.role.delete',
                label: '删除角色',
                type: 'button',
                icon: 'trash',
              },
            ],
          },
          {
            key: 'pages.sys.sys.app',
            label: '接口管理',
            type: 'page',
            icon: 'plug',
            route: 'sys.app',
            children: [
              {
                key: 'actions.app.create',
                label: '新增接口',
                type: 'button',
                icon: 'plus',
              },
              {
                key: 'actions.app.update',
                label: '编辑接口',
                type: 'button',
                icon: 'edit',
              },
              {
                key: 'actions.app.toggle',
                label: '启停接口',
                type: 'button',
                icon: 'power',
              },
              {
                key: 'actions.app.refresh-secret',
                label: '刷新密钥',
                type: 'button',
                icon: 'refresh',
              },
              {
                key: 'actions.app.delete',
                label: '删除接口',
                type: 'button',
                icon: 'trash',
              },
            ],
          },
          {
            key: 'pages.sys.sys.app-log',
            label: '接口日志',
            type: 'page',
            icon: 'file-text',
            route: 'sys.app-log',
            children: [
              {
                key: 'actions.api-log.detail',
                label: '查看接口日志详情',
                type: 'button',
                icon: 'eye',
              },
            ],
          },
          {
            key: 'pages.sys.sys.user-log',
            label: '操作日志',
            type: 'page',
            icon: 'clipboard-list',
            route: 'sys.user-log',
            children: [
              {
                key: 'actions.user-log.detail',
                label: '查看操作日志详情',
                type: 'button',
                icon: 'eye',
              },
            ],
          },
          {
            key: 'pages.sys.sys.task',
            label: '任务管理',
            type: 'page',
            icon: 'list-checks',
            route: 'sys.task',
            children: [
              {
                key: 'actions.task.add',
                label: '手动添加任务',
                type: 'button',
                icon: 'plus',
              },
              {
                key: 'actions.task.kill',
                label: '终止任务',
                type: 'button',
                icon: 'square',
              },
              {
                key: 'actions.task.schedule',
                label: '调度启停',
                type: 'button',
                icon: 'calendar-clock',
              },
            ],
          },
          {
            key: 'pages.sys.sys.table',
            label: '表管理',
            type: 'page',
            icon: 'table',
            route: 'sys.table',
            children: [
              {
                key: 'actions.table.view',
                label: '查看表清单',
                type: 'button',
                icon: 'list',
              },
              {
                key: 'actions.table.preview',
                label: '查看 Demo 数据',
                type: 'button',
                icon: 'eye',
              },
              {
                key: 'actions.table.reset',
                label: '根据 schema 重置',
                type: 'button',
                icon: 'rotate-ccw',
              },
            ],
          },
          {
            key: 'actions.setting',
            label: '系统设置',
            type: 'group',
            icon: 'sliders',
            children: [
              {
                key: 'actions.setting.set',
                label: '修改设置',
                type: 'button',
                icon: 'save',
              },
            ],
          },
        ],
      },
    ],
  },
] as const;
