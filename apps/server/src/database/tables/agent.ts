import { index, integer, jsonb, uuid } from 'drizzle-orm/pg-core';

import { timestamptz, varchar255 } from './common-columns.js';
import { pgTable, timestampsTrigger } from '../structure/index.js';

import type {
  AgentConversationStatus,
  AgentMessagePart,
  AgentMessageRole,
  AgentScenario,
} from '@repo/types';

/**
 * Agent 会话表：一个会话代表用户与某个场景 agent 的一段连续对话。
 * 会话级元数据存放于此，消息明细见 agent_messages。
 * conversation_id 使用 uuidv7，自带时序，可按 id 做 keyset 翻页。
 */
export const agent_conversations = pgTable(
  'agent_conversations',
  {
    /** 会话标识，uuidv7，时序主键 */
    conversation_id: uuid('conversation_id').primaryKey(),
    /** 发起会话的用户ID；系统发起可为空 */
    user_id: uuid('user_id'),
    /** 会话场景标识，区分用途（如 sql / chat），键值见 AgentScenario */
    scenario: varchar255('scenario').$type<AgentScenario>().notNull(),
    /** 会话标题，首条消息后自动生成，供侧边栏展示 */
    title: varchar255('title'),
    /** 会话状态：active 进行中 / archived 归档 / deleted 软删 */
    status: varchar255('status')
      .$type<AgentConversationStatus>()
      .notNull()
      .default('active'),
    /** 最近一条消息时间，侧边栏按此倒序，避免 join messages 表 */
    last_message_timestamp: timestamptz('last_message_timestamp'),
    /** 会话创建时间，由 trigger 维护 */
    create_timestamp: timestamptz('create_timestamp').notNull(),
    /** 会话最近更新时间（标题/状态/最近消息变更），由 trigger 维护 */
    last_update_timestamp: timestamptz('last_update_timestamp').notNull(),
  },
  (table) => [
    /** 侧边栏主查询：WHERE user_id=? ORDER BY last_message_timestamp DESC */
    index('agent_conversations_user_id_last_message_idx').on(
      table.user_id,
      table.last_message_timestamp,
    ),
    /** 按场景过滤会话 */
    index('agent_conversations_scenario_idx').on(table.scenario),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

/**
 * Agent 消息表：会话内每条消息一行，仅追加不更新（除软删）。
 * message_id 使用 uuidv7，按 id 倒序即按生成时间倒序，用于上下文窗口与 keyset 翻页。
 * content 以结构化片段数组存储，兼容纯文本与工具调用结果。
 */
export const agent_messages = pgTable(
  'agent_messages',
  {
    /** 消息标识，uuidv7，时序主键 */
    message_id: uuid('message_id').primaryKey(),
    /** 所属会话ID，与 agent_conversations.conversation_id 对齐 */
    conversation_id: uuid('conversation_id').notNull(),
    /** 消息角色，对齐 AI SDK CoreMessage */
    role: varchar255('role').$type<AgentMessageRole>().notNull(),
    /** 消息内容，结构化片段数组；纯文本消息为单项 text 片段 */
    content: jsonb('content').$type<AgentMessagePart[]>().notNull(),
    /** 本条消息的 token 长度估算，用于上下文窗口预算；未估算为 null 时降级按条数 */
    tokens: integer('tokens'),
    /** 消息创建时间 */
    create_timestamp: timestamptz('create_timestamp').notNull(),
  },
  (table) => [
    /** 窗口查询与 keyset 翻页主索引：WHERE conversation_id=? ORDER BY message_id DESC LIMIT N */
    index('agent_messages_conversation_id_message_idx').on(
      table.conversation_id,
      table.message_id,
    ),
  ],
);
