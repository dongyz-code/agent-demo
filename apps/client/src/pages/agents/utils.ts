import type { AgentChatMessage } from './hooks/useAgentChat.js';
import type {
  AgentConversationRecord,
  AgentMessageRecord,
} from '@repo/types';

import type { Conversation } from '@/model';

/** 空消息常量，避免未选中会话时反复生成新数组。 */
export const emptyChatMessages: AgentChatMessage[] = [];

/**
 * 把服务端历史消息转换为 AI SDK UIMessage。
 *
 * @param record 服务端消息行。
 * @returns 只保留当前 UI 会渲染的 text/reasoning parts。
 */
export function toAgentChatMessage(
  record: AgentMessageRecord,
): AgentChatMessage {
  return {
    id: record.message_id,
    role: record.role === 'user' ? 'user' : 'assistant',
    parts: record.content
      .filter(
        (part): part is { type: 'text' | 'reasoning'; text: string } => {
          return (
            (part.type === 'text' || part.type === 'reasoning') &&
            typeof part.text === 'string'
          );
        },
      )
      .map((part) => ({ type: part.type, text: part.text })),
  };
}

/**
 * 从 UIMessage 中提取指定类型文本。
 *
 * @param message 当前消息。
 * @param type 需要提取的片段类型。
 * @returns 拼接后的文本；无匹配片段时为空字符串。
 */
export function extractMessageParts(
  message: AgentChatMessage,
  type: 'text' | 'reasoning',
) {
  return message.parts
    .filter(
      (part): part is { type: 'text' | 'reasoning'; text: string } =>
        part.type === type,
    )
    .map((part) => part.text)
    .join('\n');
}

/**
 * 把服务端会话记录转换为客户端侧边栏会话。
 *
 * @param record 服务端会话记录。
 * @returns 客户端会话元数据。
 */
export function toConversation(
  record: AgentConversationRecord,
): Conversation {
  return {
    id: record.conversation_id,
    serverId: record.conversation_id,
    title: record.title ?? '未命名会话',
    scenario: record.scenario,
    status: record.status,
    updatedAt: new Date(record.last_update_timestamp).getTime(),
  };
}
