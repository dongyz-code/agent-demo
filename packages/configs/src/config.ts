import { readFileSync } from 'node:fs';
import { env, CONF_FILE } from './env.js';

import type { CONF } from './type.js';
import type { Simplify } from '@repo/types';

export type * from './type.js';

/** 根据已有条件补充的配置信息 */
type CONF_ADD = {
  /** 是否是线上环境 */
  APP_PROD: boolean;
  /** 管理员账户的ID, 除登录判断以外的其它地方使用此ID */
  SYS_ADMIN_USER_ID: string;
};

type CONF_FULL = CONF & CONF_ADD;

function getConf(file: string) {
  const confStr = (() => {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      throw new Error(`The configuration file does not exist: ${file}`);
    }
  })();

  try {
    return JSON.parse(confStr);
  } catch {
    throw new Error(`The configuration file verification failed: ${file}`);
  }
}

/** 读取进程环境变量，并转换为应用内部使用的运行时开关。
 *
 * @returns 标准化后的环境配置，`APP_PROD` 为 `true` 时启用生产环境行为。
 */
export function loadEnv() {
  const { APP_PROD = '0' } = env;
  return {
    APP_PROD: APP_PROD === '1',
  };
}

/** 获取系统配置, docker 内自行映射相应目录
 *
 * 代理里不要读取环境变量，而是读取 配置
 */
export function getSysConf<
  Add extends Record<string, unknown> = Record<string, unknown>,
>({
  add,
  force,
}: {
  /** 额外补充的配置文件路径（实际可以不存在，相当于配置合并到默认配置） */
  add?: string;
  /** 覆盖默认配置文件路径 */
  force?: string;
} = {}) {
  const { APP_PROD } = loadEnv();

  const confFile = force ?? CONF_FILE;

  const conf = getConf(confFile);

  if (add && add !== confFile) {
    try {
      const addConf = getConf(add);
      Object.assign(conf, addConf);
    } catch (error) {
      console.error(error);
    }
  }

  type ConfWithAdd =
    Record<string, unknown> extends Add ? CONF_FULL : Simplify<CONF_FULL & Add>;

  const ROOT: ConfWithAdd = {
    ...conf,
    APP_PROD,
    SYS_ADMIN_USER_ID: '-',
  };

  return ROOT;
}
