import { Link } from '@tanstack/react-router';
import { Fragment, useEffect, useMemo } from 'react';
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from 'lucide-react';

import type { AgentScenario } from '@repo/types';

import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui';
import { useAppModel, useConversationModel, useSessionModel } from '@/model';
import { routePathMap } from '@/router';
import { cn } from '@/utils';
import { api } from '@/utils/api';

import { getWorkspaceNavigation } from './navigation';

type ConversationSidebarProps = {
  /** 折叠态：仅渲染图标列，隐藏会话列表与文字标签。 */
  collapsed?: boolean;
};

/** 侧边栏会话分组展示文案。 */
const scenarioLabels: Record<AgentScenario, string> = {
  sql: 'SQL 数据',
  chat: '通用对话',
};

/**
 * 渲染左栏内容（品牌、导航、新建会话、会话列表、折叠按钮），由布局壳包裹定位与宽度。
 *
 * @param props 折叠态标记。
 * @returns 左栏内容节点。
 */
export function ConversationSidebar({
  collapsed = false,
}: ConversationSidebarProps) {
  const toggleNav = useAppModel((state) => state.toggleNav);
  const user = useSessionModel((state) => state.user);
  const permission = useSessionModel((state) => state.permission);
  const conversations = useConversationModel((state) => state.conversations);
  const currentId = useConversationModel((state) => state.currentId);
  const selectConversation = useConversationModel(
    (state) => state.selectConversation,
  );
  const createConversation = useConversationModel(
    (state) => state.createConversation,
  );
  const setConversationHistory = useConversationModel(
    (state) => state.setConversationHistory,
  );
  const setConversationHistoryLoading = useConversationModel(
    (state) => state.setConversationHistoryLoading,
  );

  const navItems = getWorkspaceNavigation({
    permission,
    sysAdmin: user?.sys_admin,
  });

  const conversationGroups = useMemo(() => {
    const groups = new Map<AgentScenario, typeof conversations>();
    for (const conversation of conversations) {
      const group = groups.get(conversation.scenario) ?? [];
      group.push(conversation);
      groups.set(conversation.scenario, group);
    }
    return [...groups.entries()].map(([scenario, items]) => ({
      scenario,
      items,
    }));
  }, [conversations]);

  useEffect(() => {
    const state = useConversationModel.getState();
    if (state.conversationHistoryLoaded || state.conversationHistoryLoading) {
      return;
    }
    setConversationHistoryLoading(true);
    void api('/agent/conversation-list', {
      limit: [0, 50],
      with_count: false,
    })
      .then((result) => {
        setConversationHistory(
          result.list.map((record) => ({
            id: record.conversation_id,
            serverId: record.conversation_id,
            title: record.title ?? '未命名会话',
            scenario: record.scenario,
            status: record.status,
            updatedAt: new Date(record.last_update_timestamp).getTime(),
          })),
        );
      })
      .catch(() => {
        setConversationHistoryLoading(false);
      });
  }, [setConversationHistory, setConversationHistoryLoading]);

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-14 shrink-0 items-center px-3',
          collapsed && 'justify-center',
        )}
      >
        <Brand collapsed={collapsed} />
      </div>

      <div className="px-2">
        <Button
          asChild
          variant={collapsed ? 'ghost' : 'default'}
          className={cn(
            'w-full',
            collapsed ? 'justify-center' : 'justify-start gap-2',
          )}
        >
          <Link to={routePathMap.agents} onClick={() => createConversation()}>
            <PlusIcon className="size-4" aria-hidden />
            {!collapsed && <span>新建会话</span>}
          </Link>
        </Button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        {navItems.map(({ name, label, to, icon: Icon }) => (
          <Button
            key={name}
            asChild
            variant="ghost"
            className={cn(
              'w-full',
              collapsed ? 'justify-center' : 'justify-start gap-2',
            )}
          >
            <Link
              to={to}
              activeProps={{
                className: 'bg-sidebar-accent text-sidebar-primary',
              }}
            >
              <Icon className="size-4" aria-hidden />
              {!collapsed && <span>{label}</span>}
            </Link>
          </Button>
        ))}

        {!collapsed && conversationGroups.length > 0 && (
          <>
            <div className="px-2 pt-4 pb-1 text-xs font-medium text-sidebar-foreground/50">
              会话
            </div>
            {conversationGroups.map(({ scenario, items }) => (
              <Fragment key={scenario}>
                <div className="px-2 pt-3 pb-1 text-xs text-sidebar-foreground/40">
                  {scenarioLabels[scenario]}
                </div>
                {items.map((conversation) => (
                  <Button
                    key={conversation.id}
                    asChild
                    variant="ghost"
                    className={cn(
                      'w-full justify-start gap-2 font-normal',
                      conversation.id === currentId &&
                        'bg-sidebar-accent text-sidebar-primary',
                    )}
                  >
                    <Link
                      to={routePathMap.agents}
                      onClick={() => selectConversation(conversation.id)}
                    >
                      <span className="truncate">{conversation.title}</span>
                    </Link>
                  </Button>
                ))}
              </Fragment>
            ))}
          </>
        )}
      </nav>

      <div className="shrink-0 p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleNav}
          aria-label={collapsed ? '展开导航' : '折叠导航'}
          title={collapsed ? '展开导航' : '折叠导航'}
        >
          {collapsed ? (
            <PanelLeftOpenIcon className="size-4" aria-hidden />
          ) : (
            <PanelLeftCloseIcon className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  );
}
