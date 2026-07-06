import type { JSONValue, LanguageModel } from 'ai';

/** 单个模型的能力说明；该表只描述本地已确认的模型，不阻止透传其他模型 ID。 */
export interface AiModelCapability {
  /** 是否已确认支持 provider 原生 json_schema 输出参数。 */
  supportsJsonSchema: boolean;
  /** 是否已确认支持供应商侧 thinking/reasoning 类控制参数。 */
  supportsThinking: boolean;
}

/** 本地已确认的模型能力表；新增模型时优先补这里，运行时仍允许传入代理侧其他模型名。 */
export const AI_MODEL_PRESETS = {
  qwen: {
    'qwen3-max': {
      supportsJsonSchema: true,
      supportsThinking: true,
    },
    'qwen3.5-flash': {
      supportsJsonSchema: true,
      supportsThinking: false,
    },
    'qwen3.6-flash': {
      supportsJsonSchema: true,
      supportsThinking: false,
    },
  },
  doubao: {
    'doubao-seed-1-8-251228': {
      supportsJsonSchema: true,
      supportsThinking: true,
    },
    'doubao-seed-1-6-flash-250828': {
      supportsJsonSchema: true,
      supportsThinking: false,
    },
    'doubao-seed-2-0-pro-260215': {
      supportsJsonSchema: true,
      supportsThinking: true,
    },
  },
  anthropic: {},
  glm: {
    'glm-5': {
      supportsJsonSchema: true,
      supportsThinking: false,
    },
  },
} as const satisfies Record<string, Record<string, AiModelCapability>>;

/**
 * 指定供应商可传入的模型 ID；预置模型提供类型补全，其他字符串会原样透传给代理服务。
 *
 * @template Provider 本地模型预置表中的供应商键，用于推导对应的预置模型。
 */
export type AiModelId<Provider extends keyof typeof AI_MODEL_PRESETS> =
  | (keyof (typeof AI_MODEL_PRESETS)[Provider] & string)
  | (string & {});

/** providerOptions 内部允许的值；`undefined` 会在返回 AI SDK 参数前被过滤。 */
export type AiProviderOptionValue = JSONValue | undefined;

/** 供应商扩展参数的基础结构，调用方可透传供应商兼容的 JSON 参数。 */
export type AiProviderOptions = Record<string, AiProviderOptionValue>;

/** OpenAI 兼容接口使用的 json_schema 输出参数结构。 */
export type AiJsonSchemaResponseFormat = {
  /** 响应格式类型，固定为 OpenAI 兼容协议的 json_schema。 */
  type: 'json_schema';
  /** json_schema 的命名、严格模式和具体 schema 定义。 */
  json_schema: {
    /** schema 名称，供应商通常要求为稳定的英文标识。 */
    name: string;
    /** 是否要求模型严格按 schema 输出。 */
    strict: boolean;
    /** 传给供应商的 JSON Schema 对象。 */
    schema: Record<string, JSONValue>;
  };
};

/** 千问模型的供应商扩展参数。 */
export interface QwenProviderOptions extends AiProviderOptions {
  /** 是否开启千问侧思考模式；具体模型是否支持以 `AI_MODEL_PRESETS` 为准。 */
  enable_thinking?: boolean;
  /** 需要直接透传给 OpenAI 兼容接口的响应格式配置。 */
  response_format?: AiJsonSchemaResponseFormat;
}

/** 豆包模型的供应商扩展参数。 */
export interface DoubaoProviderOptions extends AiProviderOptions {
  /** 豆包 thinking 控制参数，不支持思考的模型应传 `disabled` 或不传。 */
  thinking?: {
    /** 思考模式开关，`auto` 交给模型或供应商自行判断。 */
    type: 'disabled' | 'enabled' | 'auto';
  };
  /** 需要直接透传给 OpenAI 兼容接口的响应格式配置。 */
  response_format?: AiJsonSchemaResponseFormat;
}

/** Anthropic 代理的供应商扩展参数，按当前代理支持的 JSON 字段透传。 */
export type AnthropicProviderOptions = AiProviderOptions;

/** 智谱 GLM 模型的供应商扩展参数，按当前代理支持的 JSON 字段透传。 */
export type GlmProviderOptions = AiProviderOptions;

/** 千问模型选择配置。 */
export interface QwenModelConfig {
  /** 语言模型供应商键，决定读取 `AI.qwen` 配置和返回 providerOptions 的命名空间。 */
  provider: 'qwen';
  /** 千问模型 ID；预置模型提供补全，其他模型会透传给代理。 */
  model: AiModelId<'qwen'>;
  /** 千问供应商扩展参数，最终会放入 `providerOptions.qwen`。 */
  providerOptions?: QwenProviderOptions;
}

/** 豆包模型选择配置。 */
export interface DoubaoModelConfig {
  /** 语言模型供应商键，决定读取 `AI.doubao` 配置和返回 providerOptions 的命名空间。 */
  provider: 'doubao';
  /** 豆包模型 ID；预置模型提供补全，其他模型会透传给代理。 */
  model: AiModelId<'doubao'>;
  /** 豆包供应商扩展参数，最终会放入 `providerOptions.doubao`。 */
  providerOptions?: DoubaoProviderOptions;
}

/** Anthropic 模型选择配置。 */
export interface AnthropicModelConfig {
  /** 语言模型供应商键，决定读取 `AI.anthropic` 配置和返回 providerOptions 的命名空间。 */
  provider: 'anthropic';
  /** Anthropic 代理模型 ID；具体值由代理服务和 Bedrock 映射决定。 */
  model: AiModelId<'anthropic'>;
  /** Anthropic 供应商扩展参数，最终会放入 `providerOptions.anthropic`。 */
  providerOptions?: AnthropicProviderOptions;
}

/** 智谱 GLM 模型选择配置。 */
export interface GlmModelConfig {
  /** 语言模型供应商键，决定读取 `AI.glm` 配置和返回 providerOptions 的命名空间。 */
  provider: 'glm';
  /** GLM 模型 ID；预置模型提供补全，其他模型会透传给代理。 */
  model: AiModelId<'glm'>;
  /** GLM 供应商扩展参数，最终会放入 `providerOptions.glm`。 */
  providerOptions?: GlmProviderOptions;
}

/** `getModel` 接收的模型选择配置。 */
export type ModelConfig =
  | QwenModelConfig
  | DoubaoModelConfig
  | AnthropicModelConfig
  | GlmModelConfig;

/** `getModel` 返回给 AI SDK 调用层的标准结构。 */
export interface ModelResult {
  /** AI SDK 可直接传给 `generateText`、`streamText`、`generateObject` 的语言模型实例。 */
  model: LanguageModel;
  /** 按供应商命名空间组织的扩展参数，可直接传给 AI SDK 的 `providerOptions`。 */
  providerOptions: Record<string, Record<string, JSONValue>>;
}
