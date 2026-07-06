import type { AiConf } from '@/types/index.js';
import type { JSONValue, LanguageModel } from 'ai';

/** AI 供应商和可用模型的集中声明；这里的 key 同时对应 `conf.json` 的 `AI` 配置 key。 */
export const AI_PROVIDER_CONFIGS = {
  bailian: {
    /** 阿里云百炼代理下允许业务侧直接选择的模型 ID。 */
    models: ['qwen3-max', 'qwen3.5-flash', 'qwen3.6-flash', 'glm-5'],
  },
  volcengine: {
    /** 字节火山引擎代理下允许业务侧直接选择的模型 ID。 */
    models: [
      'doubao-seed-1-8-251228',
      'doubao-seed-1-6-flash-250828',
      'doubao-seed-2-0-pro-260215',
    ],
  },
  awsBedrock: {
    /** AWS Bedrock 代理下允许业务侧直接选择的 Anthropic 模型 ID。 */
    models: ['claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219'],
  },
} as const satisfies Record<keyof AiConf, { models: readonly string[] }>;

/** 当前服务端支持的 AI 供应商名称。 */
export type AiProvider = keyof typeof AI_PROVIDER_CONFIGS;

/** 供应商扩展参数，调用方按具体模型能力传入，底层会透传给 AI SDK。 */
export type AiProviderOptions = Record<string, JSONValue | undefined>;

/** 选择一个 AI 模型所需的配置；模型 ID 会根据 provider 自动收窄并提供类型提示。 */
export type ModelConfig = {
  [Provider in AiProvider]: {
    /** 供应商名称，必须存在于 `AI_PROVIDER_CONFIGS` 和 `conf.json` 的 `AI` 节点中。 */
    provider: Provider;
    /** 当前供应商下允许使用的模型 ID，由 `AI_PROVIDER_CONFIGS` 集中维护。 */
    model: (typeof AI_PROVIDER_CONFIGS)[Provider]['models'][number];
    /** 供应商扩展参数，会按 provider 名称放入 AI SDK 的 providerOptions。 */
    providerOptions?: AiProviderOptions;
  };
}[AiProvider];

/** `getModel` 返回给 AI SDK 调用层的标准结构。 */
export interface ModelResult {
  /** AI SDK 可直接传给 `generateText`、`streamText`、`generateObject` 的语言模型实例。 */
  model: LanguageModel;
  /** 按供应商命名空间组织的扩展参数，可直接传给 AI SDK 的 `providerOptions`。 */
  providerOptions: Record<string, Record<string, JSONValue>>;
}
