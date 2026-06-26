import type { ApiLogin } from '@/types';

export type SysConf = {};

/** 必须有值，禁用可选 */
export type StoreData = {
  /** 系统配置 */
  SYS_CONF: SysConf;
  /** 当前用户 */
  user: ApiLogin.LOGIN_RESPONSE['user'] | null;
  /** 权限 */
  permission: ApiLogin.LOGIN_RESPONSE['permission'];
  /** 导航模式 */
  NAV_MODE: 'horizontal' | 'vertical';
  /** 导航是否折叠 */
  NAV_COLLAPSE: boolean;
};
