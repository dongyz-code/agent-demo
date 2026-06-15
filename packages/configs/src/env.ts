import { join } from 'node:path';

import type { ProcessEnv } from './type.js';

const __dirname = import.meta.dirname;

export const env = process.env as ProcessEnv;

/** 配置文件路径 */
export const CONF_FILE = join(__dirname, '../.conf/conf.json');
