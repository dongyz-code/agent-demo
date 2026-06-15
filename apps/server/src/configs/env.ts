import { getSysConf, loadEnv } from '@repo/configs';
import { configFile } from './dirs.js';

import type { ConfExtra } from '@/types/index.js';

const { MEDO_PROD } = loadEnv();

export const ROOT = getSysConf<ConfExtra>(
  MEDO_PROD
    ? {
        /** 线上环境使用一份配置文件 */
        force: configFile,
      }
    : {
        add: configFile,
      },
);
