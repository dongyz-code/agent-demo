import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

import { Badge, Button, Input } from '@/components/ui';
import type { Conversation } from '@/model';

import { useConversationActions } from '../hooks/useConversationActions.js';

type ConversationHeaderProps = {
  /** 当前会话；为空时展示 Agents 页面标题。 */
  conversation: Conversation | null;
};

/**
 * 渲染会话顶栏，并支持标题原位重命名。
 *
 * @param props 当前会话。
 * @returns 会话顶栏节点。
 */
export function ConversationHeader({
  conversation,
}: ConversationHeaderProps) {
  const { renameConversation } = useConversationActions();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const title = draftTitle ?? conversation?.title ?? 'Agents';

  if (!conversation) {
    return (
      <div className="flex w-full max-w-3xl items-center gap-3">
        <span className="truncate text-base font-semibold tracking-tight text-foreground">
          Agents
        </span>
        <Badge
          variant="outline"
          className="ml-auto text-xs font-normal text-muted-foreground"
        >
          GLM-5.2
        </Badge>
      </div>
    );
  }

  const activeConversation = conversation;

  /** 进入编辑态并复制当前标题，避免编辑草稿与会话状态互相覆盖。 */
  function startEditing() {
    setDraftTitle(activeConversation.title);
    setEditing(true);
  }

  /** 更新标题草稿；提交成功后再同步回会话状态。 */
  function updateTitle(value: string) {
    setDraftTitle(value);
  }

  /** 保存重命名结果；本地会话直接更新，服务端会话先落库再更新界面。 */
  async function saveTitle() {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === activeConversation.title) {
      setDraftTitle(null);
      setEditing(false);
      return;
    }

    try {
      await renameConversation(activeConversation, nextTitle);
      setDraftTitle(null);
      setEditing(false);
    } catch {
      toast.error('重命名会话失败，请稍后重试');
    }
  }

  function cancelEditing() {
    setDraftTitle(null);
    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveTitle();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  }

  return (
    <div className="flex w-full max-w-3xl items-center gap-3">
      {editing ? (
        <Input
          value={title}
          onChange={(event) => updateTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          aria-label="会话标题"
          maxLength={100}
          className="h-9 max-w-sm text-base font-semibold"
        />
      ) : (
        <div className="group/title flex min-w-0 items-center gap-1">
          <button
            type="button"
            onDoubleClick={startEditing}
            className="max-w-[min(55vw,32rem)] truncate text-base font-semibold tracking-tight text-foreground"
          >
            {activeConversation.title}
          </button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={startEditing}
            aria-label="重命名会话"
            title="重命名会话"
            className="opacity-0 transition-opacity group-hover/title:opacity-100 focus-visible:opacity-100"
          >
            <PencilIcon className="size-3.5" aria-hidden />
          </Button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {editing ? (
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => void saveTitle()}
              aria-label="保存会话标题"
            >
              <CheckIcon className="size-4" aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={cancelEditing}
              aria-label="取消重命名"
            >
              <XIcon className="size-4" aria-hidden />
            </Button>
          </>
        ) : null}
        <Badge
          variant="outline"
          className="text-xs font-normal text-muted-foreground"
        >
          GLM-5.2
        </Badge>
      </div>
    </div>
  );
}
