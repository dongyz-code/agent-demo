import { embedMany } from 'ai';

import { getEmbeddingModel } from '@/hooks/agents/providers/providers.js';
import {
  DOCUMENT_SEGMENTS_COLLECTION,
  qdrantClient,
} from '@/vector/client.js';
import {
  deleteByFilter,
  upsertPoints,
  type QdrantFilter,
  type QdrantPoint,
} from '@repo/utils-qdrant';

import type { DocumentSegment } from '@repo/types';

/**
 * 文档片段向量化与 Qdrant 索引：content task 的 embedding 阶段。
 *
 * 在 `persistContentResult` 落库片段之后、`publishDocumentRagRelationsForTask` 发布之前调用。
 * 按 token 预算 + 条数分批 `embedMany`（bailian 每请求有 token/条数上限），先按 document_version_id
 * 清旧点再 upsert，对齐 persistContentResult 的删后插语义。失败抛错 → content task 失败 → 不 publish，
 * 版本留 pending 不可查询，下次重跑补齐。
 */

/** embedding 模型：bailian qwen3.7-text-embedding（1024 维，见 vector/client.ts）。 */
const EMBEDDING_MODEL = {
  provider: 'bailian' as const,
  model: 'qwen3.7-text-embedding',
};

/** 单批 embedMany 的 token 预算上限（bailian 每请求约 8K tokens，留余量）。 */
const EMBED_BATCH_TOKEN_BUDGET = 8000;
/** 单批 embedMany 条数上限（兜底，避免超长单段撑爆 token 预算）。 */
const EMBED_BATCH_MAX_ITEMS = 16;

/** 构造按 document_version_id 过滤的 Qdrant 条件，用于清旧点。 */
function versionFilter(documentVersionId: string): QdrantFilter {
  return {
    must: [
      { key: 'document_version_id', match: { value: documentVersionId } },
    ],
  } as QdrantFilter;
}

/**
 * 对一批已落库的 Segment 向量化并写入 Qdrant。
 *
 * @param input 文档稳定标识、版本标识、persistContentResult 产出的片段列表。
 */
export async function embedAndIndexSegments(input: {
  documentId: string;
  documentVersionId: string;
  segments: DocumentSegment[];
}): Promise<void> {
  // 先清该版本旧点：重处理（含切片策略变更产生新 segment_id）时不留孤儿向量。
  // 注：重处理期间版本仍可能处于 active，存在短暂"旧点已删、新点未写"窗口；
  // 因 publish 在本阶段之后才发生，首次处理不受影响，重处理为罕见路径，后续可改为先 upsert 再清 stale。
  await deleteByFilter(qdrantClient, {
    collection: DOCUMENT_SEGMENTS_COLLECTION,
    filter: versionFilter(input.documentVersionId),
  });

  if (input.segments.length === 0) return;

  const model = getEmbeddingModel(EMBEDDING_MODEL);
  const points: QdrantPoint[] = [];

  for (const batch of shardSegmentsByTokenBudget(input.segments)) {
    const { embeddings } = await embedMany({
      model,
      values: batch.map((segment) => segment.embeddingContent),
    });
    batch.forEach((segment, i) => {
      points.push({
        id: segment.segmentId,
        vector: embeddings[i],
        payload: {
          segment_id: segment.segmentId,
          document_version_id: input.documentVersionId,
          document_id: input.documentId,
          content: segment.content,
          heading_path: JSON.stringify(segment.headingPath),
          position: segment.position,
        },
      });
    });
  }

  await upsertPoints(qdrantClient, {
    collection: DOCUMENT_SEGMENTS_COLLECTION,
    points,
  });
}

/**
 * 按 token 预算 + 条数上限把 segments 切成 embedMany 批次。
 *
 * 单段超预算时单独成批（不与后续合并），交由 embedMany/bailian 处理或报错暴露。
 */
function shardSegmentsByTokenBudget(
  segments: DocumentSegment[],
): DocumentSegment[][] {
  const batches: DocumentSegment[][] = [];
  let current: DocumentSegment[] = [];
  let currentTokens = 0;
  for (const segment of segments) {
    const segTokens =
      segment.tokenCount ??
      Math.max(1, Math.ceil(segment.embeddingContent.length / 4));
    const overItems = current.length >= EMBED_BATCH_MAX_ITEMS;
    const overTokens =
      currentTokens + segTokens > EMBED_BATCH_TOKEN_BUDGET &&
      current.length > 0;
    if (overItems || overTokens) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(segment);
    currentTokens += segTokens;
  }
  if (current.length) batches.push(current);
  return batches;
}
