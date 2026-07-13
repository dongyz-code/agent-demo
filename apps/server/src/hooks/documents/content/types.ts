import type {
  DocumentSegment,
  DocumentParsedBlock,
} from '@repo/types';
import type { ReadableStoredFile } from '../upload/index.js';

/** 文档解析器输入。 */
export interface DocumentParserInput {
  /** 已验证通用文件及可重复读取流工厂。 */
  file: ReadableStoredFile;
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

/** 文档处理完成后向 Embedding/索引层交付的数据。 */
export interface ReadyDocument {
  /** 文档版本标识。 */
  documentVersionId: string;
  /** 本次处理配置版本。 */
  configVersion: string;
  /** 已完成切分的 Segment。 */
  segments: DocumentSegment[];
}
