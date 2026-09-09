import { Link } from '@tanstack/react-router';
import { BotIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui';
import { useConversationModel, useSessionModel } from '@/model';
import { routePathMap } from '@/router';

/**
 * 渲染工作台首页：欢迎区与最近会话入口，点击会话跳转对话区。
 *
 * @returns 工作台首页节点。
 */
export default function DashboardPage() {
  const user = useSessionModel((state) => state.user);
  const conversations = useConversationModel((state) => state.conversations);
  const selectConversation = useConversationModel(
    (state) => state.selectConversation,
  );
  const createConversation = useConversationModel(
    (state) => state.createConversation,
  );

  const displayName = user?.nickname ?? user?.username ?? '访客';
  const recent = conversations.slice(0, 6);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-link">
            <BotIcon className="size-4" aria-hidden />
            Agent 工作台
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">
            你好，{displayName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            从一个新会话开始，编排 Agent、查询数据与运行任务。
          </p>
          <Button asChild className="mt-4 gap-2">
            <Link
              to={routePathMap.agents}
              onClick={() => createConversation()}
            >
              <PlusIcon className="size-4" aria-hidden />
              新建会话
            </Link>
          </Button>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            最近会话
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无会话</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.map((conversation) => (
                <Button
                  key={conversation.id}
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left font-normal"
                >
                  <Link
                    to={routePathMap.agents}
                    onClick={() => selectConversation(conversation.id)}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <BotIcon
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {conversation.title}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {conversation.scenario === 'sql'
                          ? 'SQL 场景'
                          : '通用对话'}
                      </div>
                    </div>
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
