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
        user_id?: string | string[] | null;
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
