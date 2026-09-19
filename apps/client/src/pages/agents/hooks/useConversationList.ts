import { useEffect, useMemo } from 'react';

import type { Conversation } from '@/model';
import { useConversationModel } from '@/model';
import type { TimeGroup } from '@/utils';
import { getTimeGroup, timeGroupOrder } from '@/utils';
import { api } from '@/utils/api';

import { toConversation } from '../utils.js';

/** 侧边栏会话分组结果。 */
export type ConversationTimeGroup = {
  label: TimeGroup;
  items: Conversation[];
};

/**
 * 管理会话列表加载、当前会话派生值和时间分组。
 *
 * @returns 会话列表、当前会话与分组结果。
 */
export function useConversationList() {
  const conversations = useConversationModel((state) => state.conversations);
  const currentId = useConversationModel((state) => state.currentId);
  const setConversationHistory = useConversationModel(
    (state) => state.setConversationHistory,
  );
  const setConversationHistoryLoading = useConversationModel(
    (state) => state.setConversationHistoryLoading,
  );

  useEffect(() => {
    const {
      conversationHistoryLoaded,
      conversationHistoryLoading,
    } = useConversationModel.getState();

    if (conversationHistoryLoaded || conversationHistoryLoading) {
      return;
    }

    setConversationHistoryLoading(true);
    void api('/agent/conversation-list', {
      limit: [0, 50],
      with_count: false,
    })
      .then(({ list }) => {
        setConversationHistory(list.map(toConversation));
      })
      .catch(() => {
        setConversationHistoryLoading(false);
      });
  }, [setConversationHistory, setConversationHistoryLoading]);

  const current = currentId
    ? conversations.find((conversation) => conversation.id === currentId) ??
      null
    : null;
  const conversationGroups = useMemo(
    () => buildConversationTimeGroups(conversations),
    [conversations],
  );

  return { conversations, currentId, current, conversationGroups };
}

/**
 * 按最近更新时间倒序划分会话分组。
 *
 * @param conversations 当前会话列表。
 * @returns 按时间分组且组内倒序的会话列表。
 */
function buildConversationTimeGroups(
  conversations: Conversation[],
): ConversationTimeGroup[] {
  const now = Date.now();
  const groups = new Map<TimeGroup, Conversation[]>();
  const sortedConversations = [...conversations].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );

  for (const conversation of sortedConversations) {
    const label = getTimeGroup(conversation.updatedAt, now);
    const items = groups.get(label) ?? [];
    items.push(conversation);
    groups.set(label, items);
  }

  return timeGroupOrder
    .map((label) => ({
      label,
      items: groups.get(label) ?? [],
    }))
    .filter((group) => group.items.length > 0);
}
