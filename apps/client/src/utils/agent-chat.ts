import { API_BASE } from '@/constants/env';
import { getSessionEpoch, handleUnauthorized } from '@/model';

/** chat 路由返回的流式事件，已从 AI SDK UI chunk 映射为客户端模型可写入的事件。 */
export type AgentChatStreamEvent =
  | { type: 'text-delta'; delta: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      input: unknown;
      output: unknown;
      isError: boolean;
    }
  | { type: 'error'; message: string }
  | { type: 'finish'; finishReason?: string }
  | { type: 'abort' };

/** chat 路由请求参数；conversationId 为空表示让服务端新建会话。 */
export type AgentChatStreamOptions = {
  message: string;
  conversationId?: string;
  onConversationId: (conversationId: string) => void;
  onEvent: (event: AgentChatStreamEvent) => void;
};

/** SSE data 行解析前的 UI chunk 最小形状。 */
type UiStreamChunk = {
  type?: unknown;
  delta?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  input?: unknown;
  output?: unknown;
  errorText?: unknown;
  finishReason?: unknown;
};

/** 未完成的 tool 调用信息，用于补齐 tool-result 事件的工具名和入参。 */
type PendingToolCall = {
  toolName: string;
  input: unknown;
};

/**
 * 读取 chat 路由 SSE，并把 UI chunk 映射成客户端流事件。
 *
 * @param options 请求参数和事件回调。
 * @returns 流正常结束时 resolve；HTTP 或流内错误时 reject。
 */
export async function streamAgentChat(
  options: AgentChatStreamOptions,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agent/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      conversation_id: options.conversationId,
      message: options.message,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      void handleUnauthorized(getSessionEpoch());
    }
    throw new Error(`chat 请求失败：${response.status}`);
  }

  const conversationId = response.headers.get('x-conversation-id');
  if (conversationId) {
    options.onConversationId(conversationId);
  }
  if (!response.body) {
    throw new Error('chat 响应没有可读取的流');
  }

  const pendingToolCalls = new Map<string, PendingToolCall>();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex >= 0) {
      const eventText = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf('\n\n');
      dispatchSseEvent(eventText, options.onEvent, pendingToolCalls);
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    dispatchSseEvent(buffer, options.onEvent, pendingToolCalls);
  }
}

/**
 * 解析单条 SSE 事件并触发回调。
 *
 * @param eventText SSE 事件文本。
 * @param onEvent 流事件回调。
 * @param pendingToolCalls 未完成的 tool 调用表。
 * @throws 遇到流内 error chunk 或非法 JSON 时抛出。
 */
function dispatchSseEvent(
  eventText: string,
  onEvent: (event: AgentChatStreamEvent) => void,
  pendingToolCalls: Map<string, PendingToolCall>,
) {
  const data = eventText
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (data.length === 0) {
    return;
  }

  const chunk = JSON.parse(data) as UiStreamChunk;
  const event = mapChunkToEvent(chunk, pendingToolCalls);
  if (!event) {
    return;
  }
  if (event.type === 'error') {
    throw new Error(event.message);
  }
  onEvent(event);
}

/**
 * 将 AI SDK UI chunk 转换为客户端模型事件。
 *
 * @param chunk SSE 中的 JSON chunk。
 * @param pendingToolCalls 未完成的 tool 调用表。
 * @returns 可识别的事件；无关 chunk 返回 undefined。
 */
function mapChunkToEvent(
  chunk: UiStreamChunk,
  pendingToolCalls: Map<string, PendingToolCall>,
): AgentChatStreamEvent | undefined {
  switch (chunk.type) {
    case 'text-delta':
      return { type: 'text-delta', delta: String(chunk.delta ?? '') };
    case 'tool-input-available':
      if (typeof chunk.toolCallId !== 'string') {
        return undefined;
      }
      pendingToolCalls.set(chunk.toolCallId, {
        toolName: String(chunk.toolName ?? ''),
        input: chunk.input,
      });
      return {
        type: 'tool-call',
        toolCallId: chunk.toolCallId,
        toolName: String(chunk.toolName ?? ''),
        input: chunk.input,
      };
    case 'tool-output-available':
    case 'tool-output-error': {
      if (typeof chunk.toolCallId !== 'string') {
        return undefined;
      }
      const pendingToolCall = pendingToolCalls.get(chunk.toolCallId);
      return {
        type: 'tool-result',
        toolCallId: chunk.toolCallId,
        toolName: pendingToolCall?.toolName ?? '',
        input: pendingToolCall?.input,
        output:
          chunk.type === 'tool-output-error' ? chunk.errorText : chunk.output,
        isError: chunk.type === 'tool-output-error',
      };
    }
    case 'error':
      return {
        type: 'error',
        message: String(chunk.errorText ?? 'chat 流失败'),
      };
    case 'finish':
      return {
        type: 'finish',
        finishReason:
          typeof chunk.finishReason === 'string'
            ? chunk.finishReason
            : undefined,
      };
    case 'abort':
      return { type: 'abort' };
    default:
      return undefined;
  }
}
