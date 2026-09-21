import { useParams } from '@tanstack/react-router';

import { useConversationModel } from '@/model';
import { routerGo } from '@/router';

import type { Conversation } from '@/model';
import { api } from '@/utils/api';

import { agentChatRegistry } from '../chat-registry.js';

/**
 * 统一管理会话的本地操作、路由跳转和服务端持久化。
 *
 * @returns 创建、重命名和删除会话的方法。
 */
export function useConversationActions() {
  const routeParams = useParams({ strict: false });
  const renameConversation = useConversationModel(
    (state) => state.renameConversation,
  );
  const removeConversation = useConversationModel(
    (state) => state.removeConversation,
  );

  async function rename(conversation: Conversation, title: string) {
    const nextTitle = title.trim();
    await api('/agent/conversation-update', {
      conversation_id: conversation.id,
      title: nextTitle,
    });
    renameConversation(conversation.id, nextTitle);
  }

  /**
   * 进入唯一的新对话草稿。
   *
   * 草稿不创建业务 id、不进入会话列表；首次发送后由服务端创建真实会话。
   */
  async function startNew() {
    agentChatRegistry.resetDraft();
    await routerGo('agents', {
      params: { conversationId: undefined },
    });
  }

  /**
   * 删除会话；若路由当前正展示该会话，则回到未选中状态。
   *
   * @param conversation 待删除的会话。
   */
  async function remove(conversation: Conversation) {
    await api('/agent/conversation-delete', {
      conversation_id: conversation.id,
    });
    agentChatRegistry.dispose(conversation.id);
    removeConversation(conversation.id);
    const routeConversationId = routeParams.conversationId;
    if (routeConversationId === conversation.id) {
      await routerGo('agents', {
        params: { conversationId: undefined },
        replace: true,
      });
    }
  }

  return {
    startNewConversation: startNew,
    renameConversation: rename,
    deleteConversation: remove,
  };
}
