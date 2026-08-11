import { contentTypeConfig } from '@repo/shared';

import type { ContentType } from '@repo/shared';

/**
 * 按分类聚合去重后的 MIME 数组。
 *
 * @param categories 需要聚合的 contentTypeConfig 分类键。
 * @returns 合并并去重后的 MIME 数组；调用方需要集合时 `new Set(collectMimes(...))`。
 */
export function collectMimes(...categories: ContentType[]): string[] {
  return [
    ...new Set(
      categories.flatMap((category) =>
        contentTypeConfig[category].flatMap((item) => [...item.mime]),
      ),
    ),
  ];
}
