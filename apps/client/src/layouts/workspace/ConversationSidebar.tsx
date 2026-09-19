import { Link } from '@tanstack/react-router';
import { Fragment } from 'react';
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from 'lucide-react';

import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui';
import { useAppModel, useSessionModel } from '@/model';
import { useConversationActions } from '@/pages/agents/hooks/useConversationActions.js';
import { useConversationList } from '@/pages/agents/hooks/useConversationList.js';
import { routePathMap } from '@/router';
import { cn } from '@/utils';
import { timeGroupLabels } from '@/utils';

import { ConversationListItem } from './ConversationListItem';
import { getWorkspaceNavigation } from './navigation';

type ConversationSidebarProps = {
  /** 折叠态：仅渲染图标列，隐藏会话列表与文字标签。 */
  collapsed?: boolean;
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
  const { currentId, conversationGroups } = useConversationList();
  const { selectConversation, createConversation } = useConversationActions();

  const navItems = getWorkspaceNavigation({
    permission,
    sysAdmin: user?.sys_admin,
  });

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
          <Link
            to={routePathMap.agents}
            params={{ conversationId: undefined }}
            onClick={() => createConversation()}
          >
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
            {conversationGroups.map(({ label, items }) => (
              <Fragment key={label}>
                <div className="px-2 pt-3 pb-1 text-xs text-sidebar-foreground/40">
                  {timeGroupLabels[label]}
                </div>
                {items.map((conversation) => (
                  <ConversationListItem
                    key={conversation.id}
                    conversation={conversation}
                    currentId={currentId}
                    onSelect={selectConversation}
                  />
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
