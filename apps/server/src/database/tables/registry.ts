import { role, user, user_role } from './access.js';
import { agent_conversations, agent_messages } from './agent.js';
import {
  document_preview_pages,
  document_segments,
  document_versions,
  documents,
} from './document.js';
import {
  file_processing_task_stage_runs,
  file_processing_tasks,
} from './file-processing-task.js';
import {
  file_upload_parts,
  file_upload_sessions,
  files,
} from './file.js';
import { api_logs, user_logs } from './log.js';
import { rag_dataset_documents, rag_datasets } from './rag.js';
import { table_structure_ops } from './structure.js';
import { apps, sys_conf } from './system.js';
import { tasks } from './task.js';

import type { AnyPgTable } from 'drizzle-orm/pg-core';

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
  documents,
  document_versions,
  document_preview_pages,
  document_segments,
  rag_datasets,
  rag_dataset_documents,
  file_processing_tasks,
  file_processing_task_stage_runs,
] satisfies AnyPgTable[];
