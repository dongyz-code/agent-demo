import { embed, tool } from 'ai';
import { z } from 'zod/v4';

import { getEmbeddingModel } from '@/hooks/agents/providers/providers.js';
import {
  DOCUMENT_SEGMENTS_COLLECTION,
  qdrantClient,
} from '@/database/vector/client.js';
import { filterReadableDocumentIds } from '@/hooks/documents/library-access.js';
import { searchPoints } from '@repo/utils-qdrant';

/** 单次检索返回片段上限默认值。 */
const DEFAULT_TOP_K = 5;
/** tool-result 中每条 content 的最大字符数。 */
const MAX_CONTENT_CHARS = 3000;

/** searchKnowledgeBase 命中的文档片段。 */
type KnowledgeChunk = {
  segment_id: string | undefined;
  document_id: string | undefined;
  score: number;
  content: string;
  heading_path: string | undefined;
};

/**
 * 构造文档检索 tool。版本范围在调用前算好，模型只决定 query。
 *
 * @param input.userId 当前用户，返回前再确认文档仍可读。
 * @param input.versionIds 当前可检索的文档版本。
 */
export function createSearchKnowledgeBaseTool(input: {
  userId: string;
  versionIds: string[];
}) {
  return tool({
    description:
      '在当前用户可阅读的资料库中按语义检索文档片段。回答依据文档内容时调用，返回最相关的若干片段。',
    inputSchema: z.object({
      query: z.string().describe('检索查询文本'),
      top_k: z
        .number()
        .int()
        .positive()
        .max(20)
        .optional()
        .describe('返回片段数，默认 5'),
    }),
    execute: async ({ query, top_k }) => {
      if (!input.versionIds.length) {
        return {
          chunks: [] as KnowledgeChunk[],
          note: '当前没有可检索的文档',
        };
      }
      const model = getEmbeddingModel({
        provider: 'bailian',
        model: 'qwen3.7-text-embedding',
      });
      const { embedding } = await embed({ model, value: query });
      const hits = await searchPoints<{
        segment_id: string;
        document_version_id: string;
        document_id: string;
        content: string;
        heading_path: string;
        position: number;
      }>(qdrantClient, {
        collection: DOCUMENT_SEGMENTS_COLLECTION,
        vector: embedding,
        filter: {
          must: [
            {
              key: 'document_version_id',
              match: { any: input.versionIds },
            },
          ],
        },
        limit: top_k ?? DEFAULT_TOP_K,
      });
      const readable = await filterReadableDocumentIds(
        input.userId,
        hits.map((hit) => hit.payload?.document_id ?? ''),
      );
      const chunks = hits.flatMap<KnowledgeChunk>((hit) => {
        const documentId = hit.payload?.document_id;
        if (!documentId || !readable.has(documentId)) return [];
        return [
          {
            segment_id: hit.payload?.segment_id,
            document_id: documentId,
            score: +hit.score.toFixed(4),
            content: (hit.payload?.content ?? '').slice(0, MAX_CONTENT_CHARS),
            heading_path: hit.payload?.heading_path,
          },
        ];
      });
      return { chunks };
    },
  });
}
