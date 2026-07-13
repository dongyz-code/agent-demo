/** agent 会话场景标识；新增场景在此登记，键值必须稳定，不可改名（改名等于废弃历史会话）。 */
export type AgentScenario = 'sql' | 'chat';

/** 消息角色，对齐 AI SDK CoreMessage 体系。 */
export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** 会话状态：active 进行中 / archived 归档 / deleted 软删。 */
export type AgentConversationStatus = 'active' | 'archived' | 'deleted';

/**
 * 消息内容的一个片段，兼容纯文本与工具调用，对齐 AI SDK message parts。
 * 一条消息的 content 是该片段的数组，按生成顺序排列。
 */
export type AgentMessagePart =
  | { type: 'text'; text: string }
  | {
      type: 'tool_call';
      /** 工具调用唯一标识，用于关联后续的 tool_result。 */
      tool_call_id: string;
      /** 被调用的工具名。 */
      tool_name: string;
      /** 传给工具的参数，结构由具体工具决定。 */
      args: unknown;
    }
  | {
      type: 'tool_result';
      /** 对应的 tool_call 标识。 */
      tool_call_id: string;
      /** 工具执行返回的结果。 */
      result: unknown;
      /** 工具执行是否出错，true 表示这是一条失败结果。 */
      isError?: boolean;
    };
