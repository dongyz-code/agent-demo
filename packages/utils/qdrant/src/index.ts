/**
 * Qdrant 向量库薄封装：基于全局 fetch 直连 Qdrant REST API。
 *
 * 不依赖 `@qdrant/js-client-rest`，避免其传递依赖的 undici 与 Node 内置 fetch
 * （NODE_USE_ENV_PROXY 走代理时）冲突。所有调用走 Node 全局 fetch，与 AI SDK 一致。
 */

/** Qdrant 距离度量，对齐服务端枚举字符串。 */
export type QdrantDistance = 'Cosine' | 'Euclid' | 'Dot';

/** Qdrant Filter，对齐服务端 must / must_not / should 结构。 */
export type QdrantFilter = {
  must?: unknown[];
  must_not?: unknown[];
  should?: unknown[];
};

/** 向量点：pointId + 向量 + 业务 payload。 */
export type QdrantPoint<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  id: string | number;
  vector: number[];
  payload?: TPayload;
};

/** Qdrant 客户端配置（仅持有 endpoint 与可选鉴权）。 */
export type QdrantClient = {
  url: string;
  apiKey?: string;
};

/** 按 url + apiKey 缓存客户端配置，统一去尾斜杠。 */
const clientCache = new Map<string, QdrantClient>();

/**
 * 创建/复用 Qdrant 客户端配置单例。
 *
 * @param opts url 必填，apiKey 可选（Qdrant 开启鉴权时传入）。
 * @returns 复用或新建的客户端配置。
 */
export function createQdrantClient(opts: {
  url: string;
  apiKey?: string;
}): QdrantClient {
  const key = `${opts.url}::${opts.apiKey ?? ''}`;
  const cached = clientCache.get(key);
  if (cached) return cached;
  const client: QdrantClient = {
    url: opts.url.replace(/\/+$/, ''),
    apiKey: opts.apiKey,
  };
  clientCache.set(key, client);
  return client;
}

/** 内部：发起 Qdrant REST 请求，非 2xx 抛错（含状态码与响应体摘要）。 */
async function qdrantFetch<T>(
  client: QdrantClient,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${client.url}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(client.apiKey ? { 'api-key': client.apiKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant ${method} ${path} 失败: ${res.status} ${text}`.slice(0, 500));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * 确保集合存在；已存在则 no-op，不存在则按 size + distance 创建。
 *
 * @param client Qdrant 客户端配置。
 * @param opts 集合名、向量维度、距离度量（默认 Cosine）。
 */
export async function ensureCollection(
  client: QdrantClient,
  opts: { collection: string; size: number; distance?: QdrantDistance },
): Promise<void> {
  try {
    await qdrantFetch(client, 'GET', `/collections/${opts.collection}`);
    return;
  } catch {
    // 集合不存在（404）或其他探测失败，继续尝试创建
  }
  await qdrantFetch(client, 'PUT', `/collections/${opts.collection}`, {
    vectors: { size: opts.size, distance: opts.distance ?? 'Cosine' },
  });
}

/**
 * 创建 payload 字段索引；已存在则忽略（幂等，启动期重复执行安全）。
 *
 * @param client Qdrant 客户端配置。
 * @param opts 集合名、字段名、字段 schema（如 keyword/integer/float）。
 */
export async function createPayloadIndex(
  client: QdrantClient,
  opts: {
    collection: string;
    field_name: string;
    field_schema: string;
  },
): Promise<void> {
  try {
    await qdrantFetch(client, 'PUT', `/collections/${opts.collection}/index`, {
      field_name: opts.field_name,
      field_schema: opts.field_schema,
    });
  } catch {
    // 索引已存在时 Qdrant 报错，幂等忽略
  }
}

/**
 * 批量 upsert 点，自动按 batchSize 分批，wait=true 确保落盘后再返回。
 *
 * @param client Qdrant 客户端配置。
 * @param opts 集合名、点列表、每批大小（默认 256）。
 */
export async function upsertPoints<TPayload extends Record<string, unknown> = Record<string, unknown>>(
  client: QdrantClient,
  opts: {
    collection: string;
    points: QdrantPoint<TPayload>[];
    batchSize?: number;
  },
): Promise<void> {
  const batchSize = opts.batchSize ?? 256;
  for (let i = 0; i < opts.points.length; i += batchSize) {
    const chunk = opts.points.slice(i, i + batchSize);
    await qdrantFetch(client, 'PUT', `/collections/${opts.collection}/points?wait=true`, {
      points: chunk,
    });
  }
}

/**
 * 向量近邻搜索，返回 id / score / payload。
 *
 * @param client Qdrant 客户端配置。
 * @param opts 集合名、查询向量、可选过滤条件、返回条数。
 * @returns 命中点列表（含 payload，不含向量）。
 */
export async function searchPoints<TPayload = Record<string, unknown>>(
  client: QdrantClient,
  opts: {
    collection: string;
    vector: number[];
    filter?: QdrantFilter;
    limit: number;
  },
): Promise<{ id: string | number; score: number; payload?: TPayload }[]> {
  const result = await qdrantFetch<{
    result: { id: string | number; score: number; payload?: TPayload }[];
  }>(client, 'POST', `/collections/${opts.collection}/points/search`, {
    vector: opts.vector,
    filter: opts.filter,
    limit: opts.limit,
    with_payload: true,
    with_vector: false,
  });
  return result.result;
}

/**
 * 按 filter 删除点，用于版本重建前清理旧向量。
 *
 * @param client Qdrant 客户端配置。
 * @param opts 集合名、过滤条件。
 */
export async function deleteByFilter(
  client: QdrantClient,
  opts: { collection: string; filter: QdrantFilter },
): Promise<void> {
  await qdrantFetch(client, 'POST', `/collections/${opts.collection}/points/delete?wait=true`, {
    filter: opts.filter,
  });
}
