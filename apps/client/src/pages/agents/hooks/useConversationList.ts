import { useEffect, useMemo } from 'react';
import { useParams } from '@tanstack/react-router';

import type { Conversation } from '@/model';
import { useConversationModel } from '@/model';
import type { TimeGroup } from '@/utils';
import { getTimeGroup, timeGroupOrder } from '@/utils';
import { api } from '@/utils/api';

import { routerGo } from '@/router';

import { toConversation } from '../utils.js';

/** 侧边栏会话分组结果。 */
export type ConversationTimeGroup = {
  label: TimeGroup;
  items: Conversation[];
};

/**
 * 管理会话列表加载，并从路由参数派生当前会话。
 *
 * URL 是当前会话的唯一事实来源；新对话草稿不占用会话 id。
 *
 * @returns 会话列表、当前会话 id、当前会话与分组结果。
 */
export function useConversationList() {
  const conversations = useConversationModel((state) => state.conversations);
  const conversationHistoryLoaded = useConversationModel(
    (state) => state.conversationHistoryLoaded,
  );
  const routeParams = useParams({ strict: false });
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

  const routeConversationId = routeParams.conversationId;
  const current = findConversationByRouteId(
    conversations,
    routeConversationId,
  );
  const currentId = current?.id ?? null;

  const conversationGroups = useMemo(
    () => buildConversationTimeGroups(conversations),
    [conversations],
  );

  return { conversations, currentId, current, conversationGroups };
}

/** 在工作区顶层清理无效会话路由，保证同类导航只由一个组件触发。 */
export function useConversationRouteSync() {
  const conversations = useConversationModel((state) => state.conversations);
  const conversationHistoryLoaded = useConversationModel(
    (state) => state.conversationHistoryLoaded,
  );
  const routeParams = useParams({ strict: false });
  const routeConversationId = routeParams.conversationId;

  useEffect(() => {
    if (
      !conversationHistoryLoaded ||
      typeof routeConversationId !== 'string'
    ) {
      return;
    }

    const conversation = findConversationByRouteId(
      conversations,
      routeConversationId,
    );
    if (conversation) {
      return;
    }
    void routerGo('agents', {
      params: { conversationId: undefined },
      replace: true,
    });
  }, [conversationHistoryLoaded, conversations, routeConversationId]);
}

/**
 * 根据路由参数查找会话。
 *
 * @param conversations 当前会话列表。
 * @param routeConversationId 路由中的会话标识。
 * @returns 匹配的会话；未匹配时返回 null。
 */
function findConversationByRouteId(
  conversations: Conversation[],
  routeConversationId: string | undefined,
) {
  if (typeof routeConversationId !== 'string') {
    return null;
  }
  return (
    conversations.find(
      (conversation) => conversation.id === routeConversationId,
    ) ?? null
  );
}

/**
 * 按创建时间倒序划分会话分组。
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
    (left, right) => right.createdAt - left.createdAt,
  );

  for (const conversation of sortedConversations) {
    const label = getTimeGroup(conversation.createdAt, now);
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
