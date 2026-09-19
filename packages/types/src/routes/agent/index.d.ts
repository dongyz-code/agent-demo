import type {
  AgentConversationStatus,
  AgentMessagePart,
  AgentMessageRole,
  AgentMessageStatus,
  AgentScenario,
} from '../../common/agent.js';

/** Agent 会话历史记录。 */
export interface AgentConversationRecord {
  /** 服务端会话标识。 */
  conversation_id: string;
  /** 会话场景，作为客户端分组维度。 */
  scenario: AgentScenario;
  /** 会话标题；系统创建且尚未生成标题时为空。 */
  title: string | null;
  /** 会话状态。 */
  status: AgentConversationStatus;
  /** 最近一条消息时间，用于会话排序。 */
  last_message_timestamp: Date | null;
  /** 会话最近更新时间。 */
  last_update_timestamp: Date;
}

/** Agent 会话分组统计；当前按 scenario 分组，不引入额外分组表。 */
export interface AgentConversationGroupRecord {
  /** 分组对应的会话场景。 */
  scenario: AgentScenario;
  /** 当前过滤条件下的会话数量。 */
  count: number;
  /** 组内最近一条消息时间。 */
  last_message_timestamp: Date | null;
}

/** Agent 消息历史记录。 */
export interface AgentMessageRecord {
  /** 服务端消息标识。 */
  message_id: string;
  /** 所属服务端会话标识。 */
  conversation_id: string;
  /** 消息角色。 */
  role: AgentMessageRole;
  /** 结构化消息片段。 */
  content: AgentMessagePart[];
  /** 消息状态。 */
  status: AgentMessageStatus;
  /** 消息创建时间。 */
  create_timestamp: Date;
}

/** Agent 模块路由契约。 */
export type AgentAction = {
  /** agent 对话：流式返回（SSE，AI SDK UI 消息流）。 */
  chat: {
    body: {
      /** 用户消息。 */
      message: string;
      /** 已有会话 ID；不传则新建会话。 */
      conversation_id?: string;
      /** 绑定的知识库 ID；传则 agent 可检索知识库片段。 */
      dataset_id?: string;
      /** 系统提示词；不传用默认。 */
      system?: string;
      /** 是否开启模型思考输出；仅部分支持思考模式的模型生效。 */
      reasoning?: boolean;
    };
    /** 流式响应，无 JSON body（SSE 直接写 reply.raw）。 */
    resp: void;
    method: 'POST';
  };
  /** 查询当前用户的会话历史。 */
  'conversation-list': {
    body: {
      /** 标题模糊搜索。 */
      search?: string;
      /** 按场景过滤。 */
      scenario?: AgentScenario;
      /** 按状态过滤；不传时排除 deleted。 */
      status?: AgentConversationStatus[];
      /** 分页区间，格式为 [start, end)。 */
      limit?: number[];
      /** 是否返回总数。 */
      with_count?: boolean;
    };
    resp: {
      list: AgentConversationRecord[];
      count: number;
    };
    method: 'POST';
  };
  /** 查询当前用户的会话分组统计。 */
  'conversation-group-list': {
    body: {
      /** 按状态过滤；不传时排除 deleted。 */
      status?: AgentConversationStatus[];
    };
    resp: {
      list: AgentConversationGroupRecord[];
    };
    method: 'POST';
  };
  /** 删除当前用户的指定会话。 */
  'conversation-delete': {
    body: {
      /** 服务端会话标识。 */
      conversation_id: string;
    };
    resp: {
      /** 删除是否成功。 */
      ok: boolean;
    };
    method: 'POST';
  };
  /** 查询指定会话的消息历史。 */
  'message-list': {
    body: {
      /** 服务端会话标识。 */
      conversation_id: string;
      /** 按状态过滤。 */
      status?: AgentMessageStatus[];
      /** 分页区间，格式为 [start, end)，返回列表仍按时间正序。 */
      limit?: number[];
      /** 是否返回总数。 */
      with_count?: boolean;
    };
    resp: {
      list: AgentMessageRecord[];
      count: number;
    };
    method: 'POST';
  };
};
