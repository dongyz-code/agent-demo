import {
  createPayloadIndex,
  createQdrantClient,
  ensureCollection,
  type QdrantClient,
} from '@repo/utils-qdrant';

/**
 * Qdrant 向量存储连接与集合就绪检查。
 *
 * 与 PG（database/client.ts）并列，作为向量存储的客户端单例入口；
 * 由 server 启动期调用 {@link ensureDocumentSegmentsCollection} 确保集合存在。
 */

/** Qdrant 地址：默认本地容器，可用 QDRANT_URL 覆盖。 */
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

/** 文档片段向量集合名；每条点对应一个 document_segments 行。 */
export const DOCUMENT_SEGMENTS_COLLECTION = 'document_segments';

/** qwen3.7-text-embedding 输出维度（实测 1024）。 */
export const EMBEDDING_DIMENSION = 1024;

/** Qdrant 客户端单例，按 QDRANT_URL 缓存。 */
export const qdrantClient: QdrantClient = createQdrantClient({ url: QDRANT_URL });

/**
 * 启动期确保 document_segments 集合就绪：不存在则按 1024 维 Cosine 创建，
 * 并补建 document_version_id 的 payload 索引（按版本过滤查询、重建前清理都用它）。幂等。
 */
export async function ensureDocumentSegmentsCollection(): Promise<void> {
  await ensureCollection(qdrantClient, {
    collection: DOCUMENT_SEGMENTS_COLLECTION,
    size: EMBEDDING_DIMENSION,
    distance: 'Cosine',
  });
  // document_version_id 的 payload 索引：按版本过滤查询、重建前清理都用它；已存在时幂等忽略
  await createPayloadIndex(qdrantClient, {
    collection: DOCUMENT_SEGMENTS_COLLECTION,
    field_name: 'document_version_id',
    field_schema: 'keyword',
  });
}
