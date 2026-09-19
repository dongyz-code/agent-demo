import { useConversationModel } from '@/model';

import type { Conversation } from '@/model';
import { api } from '@/utils/api';

/**
 * 统一管理会话的本地操作与服务端持久化。
 *
 * @returns 创建、选择、重命名和删除会话的方法。
 */
export function useConversationActions() {
  const selectConversation = useConversationModel(
    (state) => state.selectConversation,
  );
  const createConversation = useConversationModel(
    (state) => state.createConversation,
  );
  const renameConversation = useConversationModel(
    (state) => state.renameConversation,
  );
  const removeConversation = useConversationModel(
    (state) => state.removeConversation,
  );

  async function rename(conversation: Conversation, title: string) {
    const nextTitle = title.trim();
    if (conversation.serverId) {
      await api('/agent/conversation-update', {
        conversation_id: conversation.serverId,
        title: nextTitle,
      });
    }
    renameConversation(conversation.id, nextTitle);
  }

  async function remove(conversation: Conversation) {
    if (conversation.serverId) {
      await api('/agent/conversation-delete', {
        conversation_id: conversation.serverId,
      });
    }
    removeConversation(conversation.id);
  }

  return {
    selectConversation,
    createConversation,
    renameConversation: rename,
    deleteConversation: remove,
  };
}
