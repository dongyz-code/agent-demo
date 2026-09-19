import type { AgentChatMessage } from './chat-registry.js';
import type {
  AgentConversationRecord,
  AgentMessagePart,
  AgentMessageRecord,
} from '@repo/types';

import type { Conversation } from '@/model';

/** 空消息常量，避免未选中会话时反复生成新数组。 */
export const emptyChatMessages: AgentChatMessage[] = [];

/** 消息中的动态工具片段，用于历史回放和流式渲染。 */
type AgentDynamicToolPart = Extract<
  AgentChatMessage['parts'][number],
  { type: 'dynamic-tool' }
>;

/** UI 渲染使用的工具片段视图；统一动态工具与静态工具的展示字段。 */
export type AgentMessageToolView = {
  type: string;
  toolName?: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

/**
 * 把服务端历史消息转换为 AI SDK UIMessage。
 *
 * @param record 服务端消息行。
 * @returns 保留 text/reasoning/tool-call 的 UI 消息。
 */
export function toAgentChatMessage(
  record: AgentMessageRecord,
): AgentChatMessage {
  const parts: AgentChatMessage['parts'] = [];

  for (const part of record.content) {
    if (
      (part.type === 'text' || part.type === 'reasoning') &&
      typeof part.text === 'string'
    ) {
      parts.push({ type: part.type, text: part.text });
    }
    if (part.type === 'tool-call') {
      parts.push({
        type: 'dynamic-tool',
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        state: 'input-available',
        input: part.input,
      });
    }
  }

  return {
    id: record.message_id,
    role: record.role === 'user' ? 'user' : 'assistant',
    metadata: createUserMessageMetadata(record),
    parts,
  };
}

/**
 * 恢复用户消息上保存的请求参数。
 *
 * @param record 服务端消息行。
 * @returns 仅包含思考开关的元数据；非用户消息或旧数据无值。
 */
function createUserMessageMetadata(
  record: AgentMessageRecord,
): AgentChatMessage['metadata'] {
  if (
    record.role !== 'user' ||
    !record.metadata ||
    !('reasoning' in record.metadata)
  ) {
    return undefined;
  }

  return { reasoning: record.metadata.reasoning };
}

/**
 * 把服务端历史消息列表转换为 UI 消息列表，并把工具结果合并到对应调用上。
 *
 * @param records 服务端消息行。
 * @returns 可直接写入 Chat 的消息列表。
 */
export function toAgentChatMessages(
  records: AgentMessageRecord[],
): AgentChatMessage[] {
  const messages: AgentChatMessage[] = [];

  for (const record of records) {
    if (record.role !== 'tool') {
      messages.push(toAgentChatMessage(record));
      continue;
    }

    const unmatchedParts: AgentMessagePart[] = [];
    for (const part of record.content) {
      if (part.type !== 'tool-result' || !applyToolResult(messages, part)) {
        unmatchedParts.push(part);
      }
    }

    if (unmatchedParts.length > 0) {
      messages.push(createToolResultMessage(record, unmatchedParts));
    }
  }

  return messages;
}

/**
 * 把工具结果合并到最近的对应工具调用片段。
 *
 * @param messages 已转换的消息列表。
 * @param result 服务端工具结果片段。
 * @returns 找到并更新对应调用时返回 true。
 */
function applyToolResult(
  messages: AgentChatMessage[],
  result: Extract<AgentMessagePart, { type: 'tool-result' }>,
) {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (
        part.type !== 'dynamic-tool' ||
        part.toolCallId !== result.toolCallId
      ) {
        continue;
      }

      message.parts[partIndex] = createToolPart(result);
      return true;
    }
  }

  return false;
}

/**
 * 创建工具调用或结果的 UI 片段。
 *
 * @param result 服务端工具结果片段。
 * @returns AI SDK dynamic-tool 片段。
 */
function createToolPart(
  result: Extract<AgentMessagePart, { type: 'tool-result' }>,
): AgentDynamicToolPart {
  const common = {
    type: 'dynamic-tool' as const,
    toolName: result.toolName,
    toolCallId: result.toolCallId,
    input: result.input,
  };

  if (result.isError) {
    return {
      ...common,
      state: 'output-error',
      errorText: '工具执行失败',
    };
  }

  return {
    ...common,
    state: 'output-available',
    output: result.output,
  };
}

/**
 * 为未匹配到调用的工具结果创建独立 UI 消息，避免历史信息丢失。
 *
 * @param record 服务端 tool 消息行。
 * @param parts 未匹配的工具结果片段。
 * @returns 只包含工具结果的 UI 消息。
 */
function createToolResultMessage(
  record: AgentMessageRecord,
  parts: AgentMessagePart[],
): AgentChatMessage {
  return {
    id: record.message_id,
    role: 'assistant',
    parts: parts
      .filter(
        (part): part is Extract<AgentMessagePart, { type: 'tool-result' }> =>
          part.type === 'tool-result',
      )
      .map(createToolPart),
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
 * 从 UIMessage 中提取工具调用片段。
 *
 * @param message 当前消息。
 * @returns 动态工具与静态工具片段列表。
 */
export function extractMessageToolParts(
  message: AgentChatMessage,
): AgentMessageToolView[] {
  return message.parts.filter(
    (part) => part.type === 'dynamic-tool' || part.type.startsWith('tool-'),
  ).map((part) => part as unknown as AgentMessageToolView);
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
    createdAt: new Date(record.create_timestamp).getTime(),
    updatedAt: new Date(record.last_update_timestamp).getTime(),
  };
}
