import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ROOT } from '@/configs/env.js';

import type {
  AiProvider,
  AiProviderOptions,
  ModelConfig,
  ModelResult,
} from './types.js';
import type { OpenAICompatibleProvider } from '@ai-sdk/openai-compatible';
import type { JSONValue } from 'ai';

globalThis.AI_SDK_LOG_WARNINGS = false;

/** 已创建的 OpenAI 兼容 provider 缓存，避免每次取模型都重复构造请求配置。 */
type CachedAiProvider = OpenAICompatibleProvider<string, never, never, never>;

const providerCache: Partial<Record<AiProvider, CachedAiProvider>> = {};

/** 供应商配置缺失时的统一错误前缀，方便启动或调用日志定位到 conf.json。 */
const missingConfigMessage = 'AI provider configuration is missing in conf.json';

/**
 * 获取指定供应商的 OpenAI 兼容 provider，并按供应商维度缓存。
 *
 * @param provider - 需要获取的供应商键。
 * @returns 可通过模型 ID 创建 AI SDK `LanguageModel` 的 provider。
 */
export function getLanguageProvider(provider: AiProvider): CachedAiProvider {
  const cached = providerCache[provider];

  if (cached) {
    return cached;
  }

  const config = ROOT.AI?.[provider];
  if (
    !config ||
    typeof config.apiKey !== 'string' ||
    config.apiKey.trim() === '' ||
    typeof config.baseUrl !== 'string' ||
    config.baseUrl.trim() === ''
  ) {
    throw new Error(`${missingConfigMessage}: AI.${provider}.apiKey/baseUrl`);
  }

  const created = createOpenAICompatible<string, never, never, never>({
    name: provider,
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    headers: config.headers,
  });
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
  const provider = getLanguageProvider(config.provider);
  const model = provider(config.model);
  const providerOptions = Object.fromEntries(
    Object.entries(config.providerOptions ?? {}).filter(([, value]) => value !== undefined),
  ) as Record<string, JSONValue>;

  return {
    model,
    providerOptions: {
      [config.provider]: providerOptions,
    },
  };
}
