/** agent 会话场景标识；新增场景在此登记，键值必须稳定，不可改名（改名等于废弃历史会话）。 */
export type AgentScenario = 'sql' | 'chat';

/** 消息角色，对齐 AI SDK CoreMessage 体系。 */
export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** 会话状态：active 进行中 / archived 归档 / deleted 软删。 */
export type AgentConversationStatus = 'active' | 'archived' | 'deleted';

/**
 * 消息内容片段，对齐 AI SDK v7 的 message parts 形状（text / tool-call / tool-result）。
 *
 * 一条消息的 content 是该片段的数组，按生成顺序排列。字段命名与 ai v7 的 ToolCallPart /
 * ToolResultPart 一致（kebab 鉴别符、toolCallId、toolName、input、output），因此序列化时与
 * CoreMessage.content 同形往返、无需映射。
 *
 * 这里是手工镜像而非 `import { ToolCallPart } from 'ai'`：@repo/types 是跨端共享包，直接引 ai
 * 会把 ai 的 .d.ts（依赖 Node 的 Buffer/http）经 barrel 泄漏给 client/admin。镜像保持解耦，
 * 代价是 ai 升级时需手动同步此处的字段形状。
 */
export type AgentMessagePart =
  | { type: 'text'; text: string }
  | {
      type: 'tool-call';
      /** 工具调用唯一标识，用于关联后续的 tool-result。 */
      toolCallId: string;
      /** 被调用的工具名。 */
      toolName: string;
      /** 传给工具的参数，结构由具体工具决定。 */
      input: unknown;
    }
  | {
      type: 'tool-result';
      /** 对应的 tool-call 标识。 */
      toolCallId: string;
      /** 产生该结果的工具名，与对应 tool-call 一致。 */
      toolName: string;
      /** 回显触发本次结果的工具入参，对齐 ai v7 ToolResultPart.input。 */
      input: unknown;
      /** 工具执行返回的结果。 */
      output: unknown;
      /** 工具执行是否出错，true 表示这是一条失败结果。 */
      isError?: boolean;
    };
