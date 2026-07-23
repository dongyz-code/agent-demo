import type { AiProvider } from '@/types/index.js';
import type { JSONValue, LanguageModel } from 'ai';

export type { AiProvider };

/**
 * 每个供应商允许业务侧直接选择的模型 ID；键必须与 `AiProvider` 完全对齐。
 * 新增供应商时漏配模型，`ModelConfig` 的映射类型会直接编译报错。
 */
interface AiProviderModels {
  bailian: 'qwen3-max' | 'qwen3.5-flash' | 'qwen3.7-max' | 'glm-5.2';

  volcengine:
    | 'doubao-seed-1-8-251228'
    | 'doubao-seed-1-6-flash-250828'
    | 'doubao-seed-2-0-pro-260215';

  awsBedrock: 'claude-3-5-sonnet-20241022' | 'claude-3-7-sonnet-20250219';

  google: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.0-flash';
}

/** 指定供应商下允许使用的模型 ID。 */
type AiModel<P extends AiProvider> = AiProviderModels[P];

/** 供应商扩展参数，调用方按具体模型能力传入，底层会透传给 AI SDK。 */
export type AiProviderOptions = Record<string, JSONValue | undefined>;

/** 选择一个 AI 模型所需的配置；模型 ID 会根据 provider 自动收窄并提供类型提示。 */
export type ModelConfig = {
  [Provider in AiProvider]: {
    /** 供应商名称，必须存在于 `AiProvider` 和 `conf.json` 的 `AI` 节点中。 */
    provider: Provider;
    /** 当前供应商下允许使用的模型 ID，由 `AiProviderModels` 维护。 */
    model: AiModel<Provider>;
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
