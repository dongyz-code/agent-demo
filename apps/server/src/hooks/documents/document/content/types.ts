import type { DocumentParsedBlock } from '@repo/types';
import type { ReadableDocumentSource } from '../../file/source.js';

/** 文档解析器输入。 */
export interface DocumentParserInput {
  /** 已验证通用文件及可重复读取流工厂。 */
  file: ReadableDocumentSource;
  /** 当前解析阶段上一次持久化的轻量恢复信息。 */
  checkpoint: unknown;
  /**
   * 保存当前解析阶段恢复信息。
   *
   * @param checkpoint 可 JSON 序列化且不包含文档正文或服务密钥的轻量状态。
   * @returns 当前任务仍持有 lease 且恢复信息已经落库时完成。
   */
  saveCheckpoint: (checkpoint: unknown) => Promise<void>;
  /** 确认任务仍由当前 worker 持有，失去 lease 或取消时抛出错误。 */
  assertActive: () => Promise<void>;
}

/** 通用文档解析器。 */
export interface DocumentParser {
  /** 解析器稳定名称。 */
  name: string;
  /** 解析器版本。 */
  version: string;
  /** 解析器支持的可信 MIME。 */
  contentTypes: readonly string[];
  /** 将文件转换为统一解析块。 */
  parse: (input: DocumentParserInput) => Promise<DocumentParsedBlock[]>;
}

/** 文档 Segment 策略。 */
export interface DocumentSegmentProfile {
  /** 配置稳定版本。 */
  version: string;
  /** 单个 Segment 目标 token 数。 */
  segmentSizeTokens: number;
  /** 相邻 Segment 重叠 token 数。 */
  overlapTokens: number;
}
