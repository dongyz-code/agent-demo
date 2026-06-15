import { readFileSync } from 'node:fs';
import { env, CONF_FILE } from './env.js';

import type { CONF, MEDO_ENV } from './type.js';
import type { Simplify } from '@repo/types';

export type * from './type.js';

/** 根据已有条件补充的配置信息 */
type CONF_ADD = {
  /** 是否是线上环境 */
  MEDO_PROD: boolean;
  /** 环境 */
  MEDO_ENV: MEDO_ENV;
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

export function loadEnv() {
  const { MEDO_ENV = 'default', MEDO_PROD = '0' } = env;
  return {
    MEDO_ENV,
    MEDO_PROD: MEDO_PROD === '1',
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
  const { MEDO_PROD, MEDO_ENV } = loadEnv();

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
    MEDO_PROD,
    MEDO_ENV,
    SYS_ADMIN_USER_ID: '-',
  };

  return ROOT;
}
