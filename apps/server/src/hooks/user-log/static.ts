import { logHelper, RecursionFlat } from './type.js';

export const { CONF: LOG_CONF, CONF_MAP: LOG_MAP } = logHelper({
  user: {
    login: {
      label: '用户认证-登录',
    },
    'login-by-token': {
      label: '用户认证-登录-TOKEN',
    },
  },
  table: {
    plan: {
      label: '表结构管理-生成计划',
      detail: {} as {
        /** 操作记录 ID */
        op_id: string;
        /** 操作类型：reset 或 sync */
        type: 'reset' | 'sync';
        /** managedTableRegistry 中的表 key */
        table: string;
      },
    },
    apply: {
      label: '表结构管理-执行计划',
      detail: {} as {
        /** 操作记录 ID */
        op_id: string;
        /** 操作类型：reset 或 sync */
        type: 'reset' | 'sync';
        /** managedTableRegistry 中的表 key */
        table: string;
        /** 执行后的操作状态 */
        status: 'completed' | 'failed';
      },
    },
  },
});

export type LogConf = RecursionFlat<typeof LOG_CONF>;
export type LogType = keyof LogConf;
