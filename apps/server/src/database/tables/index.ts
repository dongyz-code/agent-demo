import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

export * from './access.js';
export * from './agent.js';
export * from './log.js';
export * from './structure.js';
export * from './system.js';
export * from './task.js';
export * from './file.js';
export * from './document.js';
export * from './rag.js';
export * from './file-processing-task.js';

import { role, user, user_role } from './access.js';
import { agent_conversations, agent_messages } from './agent.js';
import { api_logs, user_logs } from './log.js';
import { table_structure_ops } from './structure.js';
import { apps, sys_conf } from './system.js';
import { tasks } from './task.js';
import {
  files,
  file_references,
  file_upload_parts,
  file_upload_sessions,
  file_variants,
} from './file.js';
import {
  documents,
  document_versions,
  document_processing_jobs,
  document_processing_stage_runs,
  document_parsed_blocks,
  document_segments,
} from './document.js';
import {
  rag_datasets,
  rag_dataset_documents,
} from './rag.js';
import {
  file_processing_tasks,
  file_processing_task_stage_runs,
} from './file-processing-task.js';

/** 允许表管理功能展示和操作的业务表白名单，不包含内部审计表。 */
export const managedTableRegistry = {
  sys_conf,
  user,
  role,
  user_role,
  apps,
  tasks,
  file_upload_sessions,
  api_logs,
  user_logs,
  agent_conversations,
  agent_messages,
};

/** 所有需要落库的 Drizzle 表（含审计表），供启动期自检遍历。 */
export const bootstrappedTableRegistry = [
  ...Object.values(managedTableRegistry),
  table_structure_ops,
  files,
  file_upload_parts,
  file_references,
  file_variants,
  documents,
  document_versions,
  document_processing_jobs,
  document_processing_stage_runs,
  document_parsed_blocks,
  document_segments,
  rag_datasets,
  rag_dataset_documents,
  file_processing_tasks,
  file_processing_task_stage_runs,
] satisfies AnyPgTable[];

/** 允许作为 managedTableRegistry key 使用的表名联合类型。 */
export type Table = keyof typeof managedTableRegistry;

/** 服务端内部读取数据库行时使用的 Drizzle select 推导类型。 */
export type SqlData = {
  [Key in keyof typeof managedTableRegistry]: InferSelectModel<
    (typeof managedTableRegistry)[Key]
  >;
};

/** 服务端内部写入数据库行时使用的 Drizzle insert 推导类型。 */
export type SqlInsertData = {
  [Key in keyof typeof managedTableRegistry]: InferInsertModel<
    (typeof managedTableRegistry)[Key]
  >;
};
