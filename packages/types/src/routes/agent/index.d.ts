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
    };
    /** 流式响应，无 JSON body（SSE 直接写 reply.raw）。 */
    resp: void;
    method: 'POST';
  };
};
