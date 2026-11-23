import { useEffect, useState } from 'react';

import { api } from '@/utils/api';
import { useConversationList } from './hooks/useConversationList.js';
import { useAgentChat } from './hooks/useAgentChat.js';
import { MessageComposer } from './components/MessageComposer';
import { MessageList } from './components/MessageList';

/**
 * 渲染 Agent 对话主区：未选会话时展示空状态，选中后展示消息流与输入区。
 *
 * @returns 对话主区节点。
 */
export default function AgentPage() {
  const { currentId, current } = useConversationList();
  const chat = useAgentChat({ conversationId: currentId });
  const isStreaming =
    chat.status === 'submitted' || chat.status === 'streaming';
  const [libraries, setLibraries] = useState<{ libraryId: string; name: string }[]>(
    [],
  );
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const lockedLibraryId = current?.libraryId ?? null;

  useEffect(() => {
    void api('/documents/library-usable-list', {}).then((result) => {
      setLibraries(result.list);
    });
  }, []);

  useEffect(() => {
    function onScope(event: Event) {
      const detail = (event as CustomEvent<{ libraryId: string | null; cleared: boolean }>)
        .detail;
      if (detail.cleared) {
        setLibraryId(null);
      }
    }
    window.addEventListener('agent-library-scope', onScope);
    return () => window.removeEventListener('agent-library-scope', onScope);
  }, []);

  const selectedLibraryId = currentId ? lockedLibraryId : libraryId;
  const canSearch = libraries.length > 0;

  return (
    <div className="relative h-full overflow-hidden">
      <MessageList
        messages={chat.messages}
        error={chat.error}
        conversationId={currentId ?? undefined}
        isStreaming={isStreaming}
        onPrompt={(prompt) => {
          void chat.sendMessage(prompt, false, selectedLibraryId);
        }}
        onRegenerate={() => {
          chat.regenerate();
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl px-4 pb-4">
          <label className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            检索范围
            <select
              className="rounded-md border bg-background px-2 py-1 text-foreground"
              value={selectedLibraryId ?? ''}
              disabled={Boolean(currentId) || !canSearch}
              onChange={(event) => {
                setLibraryId(event.target.value || null);
              }}
            >
              <option value="">全部可检索资料库</option>
              {libraries.map((library) => (
                <option key={library.libraryId} value={library.libraryId}>
                  {library.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <MessageComposer
        isStreaming={isStreaming}
        disabled={!canSearch}
        onSend={(text, reasoning) => {
          if (!canSearch) return;
          void chat.sendMessage(text, reasoning, selectedLibraryId);
        }}
        onStop={() => {
          chat.stop();
        }}
      />
    </div>
  );
}
