import { useEffect, useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { api } from '@/utils/api';

/** 检索结果里可打开的文档引用。 */
export type DocumentSource = {
  /** 文档标识。 */
  documentId: string;
  /** 命中片段。 */
  content: string;
  /** 标题路径。 */
  headingPath?: string;
};

type DocumentSourceDialogProps = {
  /** 当前打开的引用；为空时关闭弹窗。 */
  source: DocumentSource | null;
  /** 关闭弹窗。 */
  onClose: () => void;
};

/**
 * 打开引用对应的只读预览。无权或文档不存在时只显示不存在。
 *
 * @param props 当前引用和关闭回调。
 * @returns 预览弹窗。
 */
export function DocumentSourceDialog({
  source,
  onClose,
}: DocumentSourceDialogProps) {
  const [error, setError] = useState('');
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    if (!source) return;
    void load(source.documentId);
  }, [source]);

  async function load(documentId: string) {
    setError('');
    setPageUrl('');
    try {
      const preview = await api('/documents/document-preview-pages', {
        documentId,
        startPage: 1,
        pageSize: 1,
      });
      setPageUrl(preview.pages[0]?.url ?? '');
    } catch {
      setError('文档不存在');
    }
  }

  return (
    <Dialog
      open={source !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>文档引用</DialogTitle>
        </DialogHeader>
        {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
        {source ? (
          <p className="max-h-40 overflow-auto text-sm whitespace-pre-wrap">
            {source.content}
          </p>
        ) : null}
        {pageUrl ? (
          <img src={pageUrl} alt="文档预览" className="max-h-80 w-full object-contain" />
        ) : null}
        {source && !error ? (
          <Button
            variant="outline"
            onClick={() => {
              void api('/documents/document-download', {
                documentId: source.documentId,
              })
                .then((result) => {
                  window.open(result.url, '_blank', 'noopener,noreferrer');
                })
                .catch(() => {
                  setError('文档不存在');
                });
            }}
          >
            下载
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
