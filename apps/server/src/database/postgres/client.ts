import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { ROOT } from '@/configs/index.js';
import * as schemas from './tables/index.js';

import type { PoolConfig } from 'pg';

/** 按本地配置生成连接池参数，并把 pg.path 映射为 PostgreSQL search_path。 */
function createPoolConfig(): PoolConfig {
  const { path: schemaName, ...pg } = ROOT.pg;
  return {
    ...pg,
    min: 0,
    max: 100,
    options: buildSearchPathOption(schemaName),
  };
}

/** 生成 PostgreSQL 启动参数中的 search_path，保证未限定表名落在配置 schema。 */
function buildSearchPathOption(schemaName: string) {
  const normalizedSchemaName = schemaName.trim() || 'public';
  return `-c search_path=${quoteSearchPathIdentifier(normalizedSchemaName)},public`;
}

/** 引用 search_path 中的单个 schema 名称，支持 agent-demo 这类带连字符的名称。 */
function quoteSearchPathIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

const pool = new Pool(createPoolConfig());

export const db = drizzle({ client: pool, schema: schemas });
