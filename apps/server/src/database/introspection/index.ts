/**
 * introspection 子模块：读 live DB 结构、与声明态比对、漂移指纹、启动自愈。
 *
 * 纯结构机器，不依赖脱敏等业务策略（sensitive 由 hooks 层投影追加）。表管理 hooks 与
 * server 启动均从此处引入。
 */

export {
  createCatalogFingerprint,
  getTableCatalog,
} from './catalog.js';
export type { TableCatalog } from './catalog.js';

export { diffTable, normalizeSqlType } from './diff.js';
export type { DiffSchemaSide } from './diff.js';

export { startupSchemaSync } from './sync.js';
