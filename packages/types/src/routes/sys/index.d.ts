import type { ApiMultAction } from '../../common/index.js';
import type {
  ApiLogItem,
  AppItem,
  RoleItem,
  UserItem,
  UserLogItem,
} from '../models.js';
import type { TaskAction } from './task.js';
import type { TableManagementAction } from './table.js';

export type * from './task.js';
export type * from './table.js';

/** 系统基础配置，提取前后端都使用的类型 */
export type SysConfBase = {};

export type SettingAction = ApiMultAction<{
  set: {
    req: {
      data: string;
    };
  };
  get: {
    req: {};
    resp: {
      data: string | null;
    };
  };
}>;

export type UserAction = ApiMultAction<{
  create: {
    req: {
      list: (Pick<UserItem, 'nickname' | 'username' | 'email' | 'password'> & {
        role_id?: string[];
      })[];
    };
    resp: 'ok';
  };
  remove: {
    req: {
      ids: string | string[];
    };
  };
  update: {
    req: {
      id: string | string[];
      form: Partial<
        Pick<UserItem, 'nickname' | 'email' | 'password' | 'available'>
      > & {
        role_id?: string[];
      };
    };
  };
  ids: {
    req: {
      form?: {
        search?: string;
        role_id?: string[];
        available?: UserItem['available'];
        last_update_timestamp?: Date[];
        last_login_timestamp?: Date[];
      };
      limit?: number[];
      withCount?: boolean;
    };
    resp: {
      ids: string[];
      count: number;
    };
  };
  detail: {
    req: {
      ids: string[];
    };
    resp: (Omit<UserItem, 'password'> & { role_id: string[] })[];
  };
  names: {
    req: {
      ids: string[];
      full?: boolean;
    };
    resp: Pick<UserItem, 'user_id' | 'nickname' | 'email'>[];
  };
}>;

export type RoleAction = ApiMultAction<{
  create: {
    req: {
      list: Pick<RoleItem, 'name' | 'desc' | 'permission'>[];
    };
    resp: 'ok';
  };
  remove: {
    req: {
      ids: string | string[];
    };
  };
  update: {
    req: {
      id: string | string[];
      form: Partial<
        Pick<RoleItem, 'name' | 'desc' | 'permission' | 'available'>
      >;
    };
  };
  ids: {
    req: {
      form?: {
        search?: string;
        available?: RoleItem['available'];
        last_update_timestamp?: Date[];
      };
      limit?: number[];
      withCount?: boolean;
    };
    resp: {
      ids: string[];
      count: number;
    };
  };
  detail: {
    req: {
      ids: string[];
    };
    resp: RoleItem[];
  };
  names: {
    req: {
      ids: string[];
      full?: boolean;
    };
    resp: Pick<RoleItem, 'role_id' | 'name'>[];
  };
}>;

export type AppAction = ApiMultAction<{
  create: {
    req: Pick<AppItem, 'name' | 'desc'>;
    resp: 'ok';
  };
  update: {
    req: {
      id: number;
      update:
        | Partial<Pick<AppItem, 'name' | 'desc' | 'available'>>
        | 'refresh-secret';
    };
    resp: 'ok';
  };
  remove: {
    req: {
      ids: number | number[];
    };
    resp: 'ok';
  };
  ids: {
    req: {
      form?: {
        search?: string;
        available?: AppItem['available'];
        last_update_timestamp?: Date[];
        last_login_timestamp?: Date[];
      };
      limit?: number[];
      withCount?: boolean;
    };
    resp: {
      ids: number[];
      count: number;
    };
  };
  detail: {
    req: {
      ids: number[];
    };
    resp: AppItem[];
  };
  names: {
    req: {
      ids: number[];
      full?: boolean;
    };
    resp: Pick<AppItem, 'id' | 'name'>[];
  };
}>;

export type UserLogAction = ApiMultAction<{
  types: {
    req: {};
    resp: {
      label: string;
      value: string;
    }[];
  };
  list: {
    req: {
      form?: {
        search?: string;
        timestamp?: Date[];
        user_id?: string | string[];
        key?: string | string[];
        ip?: string;
      };
      limit?: number[];
      withCount?: boolean;
    };
    resp: {
      list: Omit<UserLogItem, 'detail'>[];
      count: number;
    };
  };
  detail: {
    req: {
      ids: string[];
    };
    resp: Pick<UserLogItem, 'id' | 'detail'>[];
  };
}>;

export type ApiLogAction = ApiMultAction<{
  types: {
    req: {};
    resp: {
      label: string;
      value: string;
    }[];
  };
  list: {
    req: {
      form?: {
        search?: string;
        start_timestamp?: Date[];
        user_id?: string | string[] | null;
        url?: string;
        ip?: string;
        status?: string | string[];
        mode?: string | string[];
        client_id?: string | string[] | null;
        client_mark?: string | string[] | null;
      };
      limit?: number[];
      withCount?: boolean;
    };
    resp: {
      list: Omit<ApiLogItem, 'detail'>[];
      count: number;
    };
  };
  detail: {
    req: {
      ids: string[];
    };
    resp: Pick<ApiLogItem, 'id' | 'detail'>[];
  };
}>;

/** 用户组及其成员。 */
export interface UserGroupInfo {
  /** 用户组标识。 */
  userGroupId: string;
  /** 组名。 */
  name: string;
  /** 说明。 */
  description: string | null;
  /** 成员数量。 */
  memberCount: number;
  /** 仍引用该组的资料库数量。 */
  libraryCount: number;
}

/** 用户组成员摘要。 */
export interface UserGroupMemberInfo {
  /** 用户标识。 */
  userId: string;
  /** 用户昵称。 */
  nickname: string;
  /** 登录名。搜索候选项会带上，便于和昵称区分。 */
  username?: string;
}

/** 用户组管理接口。 */
export type GroupAction = ApiMultAction<{
  list: {
    req: {
      search?: string;
      limit?: number[];
      withCount?: boolean;
    };
    resp: { list: UserGroupInfo[]; count: number };
  };
  detail: {
    req: { userGroupId: string };
    resp: UserGroupInfo & { members: UserGroupMemberInfo[] };
  };
  create: {
    req: { name: string; description?: string };
    resp: UserGroupInfo;
  };
  update: {
    req: { userGroupId: string; name?: string; description?: string | null };
    resp: UserGroupInfo;
  };
  remove: {
    req: { userGroupId: string };
    resp: 'ok';
  };
  'member-save': {
    req: { userGroupId: string; userIds: string[] };
    resp: UserGroupInfo & { members: UserGroupMemberInfo[] };
  };
  'user-search': {
    req: { search?: string };
    resp: { list: UserGroupMemberInfo[] };
  };
}>;

export type Sys = {
  // 系统设置
  [key in keyof SettingAction as `setting/${key}`]: SettingAction[key];
} & {
  // 用户管理
  [key in keyof UserAction as `user/${key}`]: UserAction[key];
} & {
  // 角色管理
  [key in keyof RoleAction as `role/${key}`]: RoleAction[key];
} & {
  // 用户组
  [key in keyof GroupAction as `group/${key}`]: GroupAction[key];
} & {
  // 接口管理
  [key in keyof AppAction as `app/${key}`]: AppAction[key];
} & {
  // 任务管理
  [key in keyof TaskAction as `task/${key}`]: TaskAction[key];
} & {
  // 用户操作日志
  [key in keyof UserLogAction as `user-log/${key}`]: UserLogAction[key];
} & {
  // API 调用日志
  [key in keyof ApiLogAction as `api-log/${key}`]: ApiLogAction[key];
} & {
  // 表结构管理
  [key in keyof TableManagementAction as `table/${key}`]: TableManagementAction[key];
};
