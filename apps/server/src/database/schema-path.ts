import { ROOT } from '@/configs/index.js';

/** Drizzle 表未显式声明 schema 时使用的 PostgreSQL schema。 */
export const configuredTableSchema = ROOT.pg.path?.trim() || 'public';

/** 生成 PostgreSQL 启动参数中的 search_path，保证未限定表名落在配置 schema。 */
export function buildSearchPathOption() {
  return `-c search_path=${quoteSearchPathIdentifier(configuredTableSchema)},public`;
}

/** 引用 search_path 中的单个 schema 名称，支持 agent-demo 这类带连字符的名称。 */
function quoteSearchPathIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
