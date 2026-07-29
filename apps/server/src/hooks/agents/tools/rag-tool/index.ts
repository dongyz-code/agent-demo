import { eq, isNotNull } from 'drizzle-orm';
import { embed, tool } from 'ai';
import { z } from 'zod/v4';

import { buildWhere, db, schemas } from '@/database/index.js';
import { getEmbeddingModel } from '@/hooks/agents/providers/providers.js';
import { DOCUMENT_SEGMENTS_COLLECTION, qdrantClient } from '@/vector/client.js';
import { searchPoints } from '@repo/utils-qdrant';

/** 单次检索返回片段上限默认值。 */
const DEFAULT_TOP_K = 5;
/** tool-result 中每条 content 的最大字符数，避免超大片段撑爆模型上下文。 */
const MAX_CONTENT_CHARS = 800;

/** searchKnowledgeBase 命中的文档片段。 */
type KnowledgeChunk = {
  segment_id: string | undefined;
  document_id: string | undefined;
  score: number;
  content: string;
  heading_path: string | undefined;
};

/**
 * 构造知识库检索 tool：闭包捕获 datasetId，模型只决定 query（+可选 top_k）。
 *
 * execute：embed(query) → PG 查该知识库 ready 的 active 版本 → Qdrant 按版本过滤近邻搜 → 返回 chunks。
 * datasetId 不暴露给模型（模型无从得知具体 id），避免瞎传；会话级绑定由 chatAgent 注入。
 *
 * @param input.datasetId 本会话绑定的知识库，tool 只在该库内检索。
 */
export function createSearchKnowledgeBaseTool(input: { datasetId: string }) {
  return tool({
    description:
      '在当前知识库中按语义检索文档片段。当用户提问涉及知识库内文档内容时调用，返回最相关的若干片段。',
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
      const limit = top_k ?? DEFAULT_TOP_K;

      // 1) 该知识库当前 ready 且有 active 版本的 document_version_id
      const where = buildWhere((filter) => {
        filter.push(
          eq(schemas.rag_dataset_documents.dataset_id, input.datasetId),
          eq(schemas.rag_dataset_documents.rag_status, 'ready'),
          isNotNull(schemas.rag_dataset_documents.active_version_id),
        );
      });
      const versionRows = await db
        .select({
          active_version_id: schemas.rag_dataset_documents.active_version_id,
        })
        .from(schemas.rag_dataset_documents)
        .where(where);
      const versionIds = versionRows
        .map((row) => row.active_version_id)
        .filter((v): v is string => v !== null);
      if (versionIds.length === 0) {
        return {
          chunks: [] as KnowledgeChunk[],
          note: '知识库暂无可检索的已就绪文档',
        };
      }

      // 2) embed query
      const model = getEmbeddingModel({
        provider: 'bailian',
        model: 'qwen3.7-text-embedding',
      });
      const { embedding } = await embed({ model, value: query });

      // 3) Qdrant 按 document_version_id 过滤近邻搜
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
          must: [{ key: 'document_version_id', match: { any: versionIds } }],
        },
        limit,
      });

      return {
        chunks: hits.map<KnowledgeChunk>((h) => ({
          segment_id: h.payload?.segment_id,
          document_id: h.payload?.document_id,
          score: +h.score.toFixed(4),
          content: (h.payload?.content ?? '').slice(0, MAX_CONTENT_CHARS),
          heading_path: h.payload?.heading_path,
        })),
      };
    },
  });
}
