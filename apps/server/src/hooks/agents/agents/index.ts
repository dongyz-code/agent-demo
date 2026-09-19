import { and, desc, eq, gt } from 'drizzle-orm';
import { stepCountIs, streamText } from 'ai';

import { db, schemas } from '@/database/index.js';
import { uuidv7 } from '@/utils/index.js';
import { getMessages } from './context.js';
import { getModel } from '../providers/providers.js';
import { createSearchKnowledgeBaseTool } from '../tools/rag-tool/index.js';

import type {
  AgentAssistantMeta,
  AgentMessagePart,
  AgentMessageStatus,
  AgentToolMeta,
} from '@repo/types';

export const chatAgent = async (input: {
  conversation_id?: string;
  system: string;
  message: string;
  userId: string;
  abortSignal?: AbortSignal;
  /** 是否显式开启思考输出；仅传给支持该参数的兼容供应商。 */
  reasoning?: boolean;
  /** 是否重新生成上一条回复；true 时不重复写入用户消息。 */
  regenerate?: boolean;
  now: Date;
  /** 绑定的知识库 ID；提供则注册检索 tool，agent 可在回答前检索知识库片段。 */
  dataset_id?: string;
}) => {
  if (input.regenerate && !input.conversation_id) {
    throw new Error('重新生成回复必须提供已有会话 ID');
  }

  const isNewConversation = !input.conversation_id;
  const conversation_id = input.conversation_id || uuidv7();
  const message_id = uuidv7();

  if (isNewConversation) {
    await db.insert(schemas.agent_conversations).values({
      conversation_id,
      scenario: 'chat',
      user_id: input.userId,
      status: 'active',
      title: input.message.slice(0, 100),
      create_timestamp: input.now,
      last_update_timestamp: input.now,
      last_message_timestamp: input.now,
    });
  }

  const { model, providerOptions } = getModel({
    provider: 'bailian',
    model: 'glm-5.2',
    providerOptions: input.reasoning
      ? { enable_thinking: true }
      : undefined,
  });

  // 先取历史（不含本次 user 消息），再落 user 消息，最后把 user 消息拼进上下文——避免重复入上下文。
  let messages = await getMessages({ conversation_id });

  if (input.regenerate) {
    const lastUserMessage = await db.query.agent_messages.findFirst({
      columns: { message_id: true },
      where: and(
        eq(schemas.agent_messages.conversation_id, conversation_id),
        eq(schemas.agent_messages.role, 'user'),
      ),
      orderBy: desc(schemas.agent_messages.message_id),
    });
    if (!lastUserMessage) {
      throw new Error('会话中没有可重新生成的用户消息');
    }

    await db
      .delete(schemas.agent_messages)
      .where(
        and(
          eq(schemas.agent_messages.conversation_id, conversation_id),
          gt(schemas.agent_messages.message_id, lastUserMessage.message_id),
        ),
      );
    messages = await getMessages({
      conversation_id,
      before_message_id: lastUserMessage.message_id,
    });
  } else {
    await db.insert(schemas.agent_messages).values({
      conversation_id,
      message_id,
      role: 'user',
      content: [{ type: 'text', text: input.message }],
      metadata: { reasoning: input.reasoning },
      create_timestamp: input.now,
    });
  }

  // 绑定知识库时注册检索 tool；闭包捕获 datasetId，模型只决定 query。
  const tools = input.dataset_id
    ? {
        searchKnowledgeBase: createSearchKnowledgeBaseTool({
          datasetId: input.dataset_id,
        }),
      }
    : undefined;

  const modelMessages = input.regenerate
    ? messages
    : [
        ...messages,
        {
          role: 'user' as const,
          content: input.message,
        },
      ];

  const stream = streamText({
    model,
    messages: modelMessages,
    system: input.system,
    providerOptions,
    abortSignal: input.abortSignal,
    tools,
    stopWhen: stepCountIs(10),
    onStepEnd: async ({
      stepNumber,
      reasoningText,
      text,
      toolCalls,
      toolResults,
      finishReason,
      usage,
      model: stepModel,
      performance,
    }) => {
      // ① assistant 行：模型本步产出（文本 + 工具调用）。先于 tool 行写入，uuidv7 时序保证正序读取时 assistant 在 tool 前。
      const assistantParts: AgentMessagePart[] = [];
      if (reasoningText) {
        assistantParts.push({ type: 'reasoning', text: reasoningText });
      }
      if (text) {
        assistantParts.push({ type: 'text', text });
      }
      for (const tc of toolCalls) {
        assistantParts.push({
          type: 'tool-call',
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input,
        });
      }

      if (assistantParts.length > 0) {
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        const assistantMeta: AgentAssistantMeta = {
          stepNumber,
          model: { provider: stepModel.provider, modelId: stepModel.modelId },
          finishReason,
          usage: { inputTokens, outputTokens },
          performance: { stepTimeMs: performance.stepTimeMs },
        };
        const assistantStatus: AgentMessageStatus =
          finishReason === 'error' ? 'error' : 'active';
        await db.insert(schemas.agent_messages).values({
          conversation_id,
          message_id: uuidv7(),
          role: 'assistant',
          content: assistantParts,
          metadata: assistantMeta,
          tokens: inputTokens + outputTokens,
          status: assistantStatus,
          create_timestamp: input.now,
        });
      }

      // ② tool 行：本步工具执行结果。tool 消息是“系统代模型执行工具”的产物，非模型产出——
      //    metadata 只记执行信息（步号/耗时），tokens 为 null，靠 toolCallId 关联前一条 assistant 的 tool-call。
      if (toolResults.length > 0) {
        // SDK v7 的 TypedToolResult 类型未声明 isError（工具出错时 SDK 以 type:'tool-error' 的流式 part
        // 单独表达，不挂在 toolResults 项上）。运行时仍可能带该字段，此处防御性读取以标记失败结果。
        const toolParts: AgentMessagePart[] = toolResults.map(
          (tr): AgentMessagePart => ({
            type: 'tool-result',
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            input: tr.input,
            output: tr.output,
            isError: (tr as { isError?: boolean }).isError === true,
          }),
        );
        const toolDurationMs = Object.values(
          performance.toolExecutionMs,
        ).reduce((sum, ms) => sum + ms, 0);
        const toolMeta: AgentToolMeta = { stepNumber, durationMs: toolDurationMs };
        const toolStatus: AgentMessageStatus = toolResults.some(
          (tr) => (tr as { isError?: boolean }).isError === true,
        )
          ? 'error'
          : 'active';
        await db.insert(schemas.agent_messages).values({
          conversation_id,
          message_id: uuidv7(),
          role: 'tool',
          content: toolParts,
          metadata: toolMeta,
          tokens: null,
          status: toolStatus,
          create_timestamp: input.now,
        });
      }
    },
    onEnd: async () => {
      // 刷新会话最近消息时间；last_update_timestamp 由 trigger 自动维护
      await db
        .update(schemas.agent_conversations)
        .set({ last_message_timestamp: input.now })
        .where(eq(schemas.agent_conversations.conversation_id, conversation_id));
    },
  });

  return {
    conversation_id,
    stream,
  };
};
