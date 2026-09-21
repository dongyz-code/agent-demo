import { Link } from '@tanstack/react-router';
import { MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import type { Conversation } from '@/model';
import { useConversationActions } from '@/pages/agents/hooks/useConversationActions.js';
import { routePathMap } from '@/router';
import { cn } from '@/utils';

type ConversationListItemProps = {
  /** 待渲染的会话。 */
  conversation: Conversation;
  /** 当前选中会话 id，用于高亮。 */
  currentId: string | null;
};

/**
 * 渲染单个侧边栏会话项，并提供 ChatGPT 式悬浮操作菜单与删除确认。
 *
 * @param props 会话数据和选中状态。
 * @returns 会话项节点。
 */
export function ConversationListItem({
  conversation,
  currentId,
}: ConversationListItemProps) {
  const { deleteConversation: deleteConversationAction } =
    useConversationActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteConversation() {
    setDeleting(true);
    try {
      await deleteConversationAction(conversation);
      setConfirmOpen(false);
    } catch {
      toast.error('删除会话失败，请稍后重试');
    } finally {
      setDeleting(false);
    }
  }

  const actionButtonVisible = menuOpen || confirmOpen;

  return (
    <div className="group/conversation relative flex items-center">
      <Button
        asChild
        variant="ghost"
        className="w-full justify-start gap-2 pr-9 font-normal"
      >
        <Link
          to={routePathMap.agents}
          params={{ conversationId: conversation.id }}
          className={cn(
            'w-full',
            conversation.id === currentId &&
              'bg-sidebar-accent text-sidebar-primary',
          )}
        >
          <span className="truncate">{conversation.title}</span>
        </Link>
      </Button>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`操作会话：${conversation.title}`}
            className={cn(
              'absolute right-1 transition-opacity',
              actionButtonVisible
                ? 'opacity-100'
                : 'opacity-0 group-hover/conversation:opacity-100 focus-visible:opacity-100',
            )}
          >
            <MoreHorizontalIcon className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2Icon aria-hidden />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold mb-2">
              删除会话？
            </DialogTitle>
            <DialogDescription>
              删除后将不再显示“{conversation.title}
              ”及其消息历史。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>
                取消
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                void deleteConversation();
              }}
            >
              {deleting ? '删除中…' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
