import { toast, type ExternalToast } from 'sonner';

import type { ReactNode } from 'react';

/** 消息内容，支持文本、React 节点或延迟生成节点的函数。 */
export type MessageContent = ReactNode | (() => ReactNode);

/** 消息提示配置，透传 Sonner 的官方选项。 */
export type MessageOptions = ExternalToast;

/**
 * 提供可在普通函数、请求拦截器和事件处理器中调用的全局消息提示。
 * 返回值是 Sonner 生成的消息 id，可传给 dismiss 关闭指定消息。
 */
export const message = {
  success(content: MessageContent, options?: MessageOptions) {
    return toast.success(content, options);
  },
  info(content: MessageContent, options?: MessageOptions) {
    return toast.info(content, options);
  },
  warning(content: MessageContent, options?: MessageOptions) {
    return toast.warning(content, options);
  },
  error(content: MessageContent, options?: MessageOptions) {
    return toast.error(content, options);
  },
  loading(content: MessageContent, options?: MessageOptions) {
    return toast.loading(content, options);
  },
  dismiss(id?: string | number) {
    return toast.dismiss(id);
  },
};
