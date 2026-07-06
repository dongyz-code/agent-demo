import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ROOT } from '@/configs/env.js';

import type {
  AiModelId,
  AiProviderOptions,
  ModelConfig,
  ModelResult,
} from './types.js';
import type { AiProviderSecret } from '@/types/index.js';
import type { OpenAICompatibleProvider } from '@ai-sdk/openai-compatible';
import type { JSONValue } from 'ai';

globalThis.AI_SDK_LOG_WARNINGS = false;

/** 已创建的 OpenAI 兼容 provider 缓存，避免每次取模型都重复构造请求配置。 */
type CachedLanguageProvider = OpenAICompatibleProvider<string, never, never, never>;

const languageProviderCache: Partial<Record<ModelConfig['provider'], CachedLanguageProvider>> = {};

/** 供应商配置缺失时的统一错误前缀，方便启动或调用日志定位到 conf.json。 */
const missingConfigMessage = 'AI provider configuration is missing in conf.json';

/**
 * 判断配置值是否是非空字符串。
 *
 * @param value - 从配置文件读取到的待检查值。
 * @returns 当值为去除空白后仍有内容的字符串时返回 true。
 */
function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 读取并校验语言模型供应商配置。
 *
 * @param provider - 需要读取的语言模型供应商键。
 * @returns 已确认包含 apiKey 和 baseUrl 的供应商连接配置。
 * @throws 当 `conf.json` 未配置对应供应商或关键字段为空时抛出错误。
 */
export function assertLanguageProviderConfigured(
  provider: ModelConfig['provider'],
): AiProviderSecret {
  const config = ROOT.AI?.[provider];

  if (!config || !isFilledString(config.apiKey) || !isFilledString(config.baseUrl)) {
    throw new Error(`${missingConfigMessage}: AI.${provider}.apiKey/baseUrl`);
  }

  return config;
}

/**
 * 创建 OpenAI 兼容协议的语言模型供应商实例。
 *
 * @template Provider 当前模型配置中的供应商键，用于限定该 provider 可接受的模型 ID 类型。
 * @param provider - 需要创建的供应商键。
 * @returns 已绑定密钥、基础地址和固定请求头的 OpenAI 兼容 provider。
 */
function createLanguageProvider<Provider extends ModelConfig['provider']>(
  provider: Provider,
): OpenAICompatibleProvider<AiModelId<Provider>, never, never, never> {
  const config = assertLanguageProviderConfigured(provider);

  return createOpenAICompatible<AiModelId<Provider>, never, never, never>({
    name: provider,
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    headers: config.headers,
  });
}

/**
 * 获取指定供应商的 OpenAI 兼容 provider，并按供应商维度缓存。
 *
 * @template Provider 当前模型配置中的供应商键，用于限定返回 provider 的模型 ID 类型。
 * @param provider - 需要获取的供应商键。
 * @returns 可通过模型 ID 创建 AI SDK `LanguageModel` 的 provider。
 */
export function getLanguageProvider<Provider extends ModelConfig['provider']>(
  provider: Provider,
): OpenAICompatibleProvider<AiModelId<Provider>, never, never, never> {
  const cached = languageProviderCache[provider];

  if (cached) {
    return cached as unknown as OpenAICompatibleProvider<AiModelId<Provider>, never, never, never>;
  }

  const created = createLanguageProvider(provider);
  languageProviderCache[provider] = created as unknown as CachedLanguageProvider;

  return created;
}

/**
 * 过滤 providerOptions 中的 undefined，避免把无效字段传给 AI SDK 或供应商代理。
 *
 * @param providerOptions - 调用方传入的供应商扩展参数。
 * @returns 仅包含 JSON 可序列化值的供应商扩展参数。
 */
function normalizeProviderOptions(
  providerOptions: AiProviderOptions | undefined,
): Record<string, JSONValue> {
  const normalized: Record<string, JSONValue> = {};

  if (!providerOptions) {
    return normalized;
  }

  for (const [key, value] of Object.entries(providerOptions)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }

  return normalized;
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

  return {
    model,
    providerOptions: {
      [config.provider]: normalizeProviderOptions(config.providerOptions),
    },
  };
}
