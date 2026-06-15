import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { ROOT } from '@/configs/index.js';
import * as schema from './schema/index.js';
import { buildSearchPathOption } from './schema-path.js';

import type { PoolConfig } from 'pg';

/** 按本地配置生成连接池参数，并把 pg.path 映射为 PostgreSQL search_path。 */
function createPoolConfig(): PoolConfig {
  const { path: _path, ...pg } = ROOT.pg;
  return {
    ...pg,
    min: 0,
    max: 100,
    options: buildSearchPathOption(),
  };
}

export const pool = new Pool(createPoolConfig());

export const db = drizzle({ client: pool, schema });

export type Db = typeof db;
