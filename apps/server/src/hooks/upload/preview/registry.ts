import { directPreviewProvider } from './direct.js';
import { imagePreviewProvider } from './image.js';
import { officePreviewProvider } from './office.js';
import { textPreviewProvider } from './text.js';

import type { PreviewProvider } from './types.js';

/**
 * 预览提供器按优先级注册。
 *
 * 图片优先走缩略图而不是 direct，避免列表预览直接加载超大原图。
 */
const providers: PreviewProvider[] = [
  imagePreviewProvider,
  textPreviewProvider,
  officePreviewProvider,
  directPreviewProvider,
];

/** 按可信 MIME 选择预览提供器。 */
export function getPreviewProvider(contentType: string) {
  return providers.find((provider) => provider.supports(contentType));
}

/** 返回已注册提供器只读副本，供诊断和测试使用。 */
export function listPreviewProviders() {
  return [...providers];
}
