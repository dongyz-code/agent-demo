import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ROOT } from '@/configs/env.js';

import type { AiProvider, AiProviderSecret } from '@/types/index.js';
import type { ModelConfig, ModelResult } from './types.js';
import type { JSONValue, LanguageModel, EmbeddingModel } from 'ai';

/**
 * AI SDK provider 的最小调用契约：同时暴露语言模型与 embedding 模型构造器。
 * 无论底层走哪个 `createXxx`，统一成此契约后 `getModel` / `getEmbeddingModel` 无需关心具体 SDK。
 */
type AiSdkProvider = {
  languageModel: (modelId: string) => LanguageModel;
  embeddingModel: (modelId: string) => EmbeddingModel;
};

/**
 * 供应商工厂：把 conf.json 里的连接密钥构造成上述调用契约。
 * 新增非 OpenAI 兼容 SDK 只需追加一条工厂。
 */
type AiProviderFactory = (
  secret: AiProviderSecret | undefined,
) => AiSdkProvider;

/** 已创建的 provider 句柄缓存，避免每次取模型都重复构造请求配置。 */
const providerCache: Partial<Record<AiProvider, AiSdkProvider>> = {};

/** 构造 OpenAI 兼容供应商工厂（bailian/volcengine/awsBedrock 等代理共用，需要 apiKey + baseUrl）。 */
function openAICompatibleFactory(provider: AiProvider): AiProviderFactory {
  return (secret) => {
    // baseURL 是 SDK 必填字段，缺失时不在构造期报错，会在首次请求抛模糊的 Invalid URL，故在此 fail-fast。
    const baseURL = secret?.baseUrl;
    if (!baseURL) {
      throw new Error(`AI.${provider}.baseUrl is missing in conf.json`);
    }
    // createOpenAICompatible 返回的 provider 同时带 languageModel 和 textEmbeddingModel
    return createOpenAICompatible({
      name: provider,
      apiKey: secret?.apiKey,
      baseURL,
      headers: secret?.headers,
    }) as AiSdkProvider;
  };
}

/** 构造 Google Generative AI 工厂（官方 SDK，仅需 apiKey；baseUrl 可选，用于代理）。 */
function googleFactory(): AiProviderFactory {
  return (secret) =>
    createGoogle({
      apiKey: secret?.apiKey,
      baseURL: secret?.baseUrl,
      headers: secret?.headers,
    }) as AiSdkProvider;
}

/**
 * 供应商 → 工厂 派发表；key 与 `AiProviderCatalog` / conf.json `AI` 节点对齐。
 * 新增供应商：在 `AiProviderCatalog` 加一条类型，这里加一条工厂即可被 `getModel` / `getEmbeddingModel` 使用。
 */
const AI_PROVIDER_FACTORIES: { [P in AiProvider]: AiProviderFactory } = {
  bailian: openAICompatibleFactory('bailian'),
  volcengine: openAICompatibleFactory('volcengine'),
  awsBedrock: openAICompatibleFactory('awsBedrock'),
  google: googleFactory(),
};

/**
 * 获取指定供应商的 SDK 句柄，并按供应商维度缓存。
 *
 * @param provider - 需要获取的供应商键。
 * @returns 同时可创建 LanguageModel 与 TextEmbeddingModel 的 SDK 句柄。
 */
export function getSdk(provider: AiProvider): AiSdkProvider {
  const cached = providerCache[provider];
  if (cached) {
    return cached;
  }

  const created = AI_PROVIDER_FACTORIES[provider](ROOT.AI?.[provider]);
  providerCache[provider] = created;

  return created;
}

/**
 * 根据供应商和模型 ID 创建 AI SDK 语言模型，并返回匹配的 providerOptions 命名空间。
 *
 * @param config - 模型选择配置，包含供应商键、模型 ID 和可选供应商扩展参数。
 * @returns AI SDK 调用层可直接展开使用的模型实例和 providerOptions。
 */
export function getModel(config: ModelConfig): ModelResult {
  const sdk = getSdk(config.provider);
  const model = sdk.languageModel(config.model);
  const providerOptions = Object.fromEntries(
    Object.entries(config.providerOptions ?? {}).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Record<string, JSONValue>;

  return {
    model,
    providerOptions: {
      [config.provider]: providerOptions,
    },
  };
}

/**
 * 根据供应商和模型 ID 创建 embedding 模型，供 RAG 入库与查询向量化使用。
 *
 * @param config 供应商与 embedding 模型 ID（model 不走聊天模型窄化，embedding 模型 id 独立维护）。
 * @returns AI SDK EmbeddingModel，可直接传给 `embed` / `embedMany`。
 */
export function getEmbeddingModel(config: {
  provider: AiProvider;
  model: string;
}): EmbeddingModel {
  return getSdk(config.provider).embeddingModel(config.model);
}
