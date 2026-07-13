/** 文件内容验证器输入。 */
export interface FileValidationInput {
  /** 文件前缀字节。 */
  prefix: Buffer;
  /** 初始化时声明的 MIME。 */
  declaredContentType: string;
}

/** 文件内容验证器输出。 */
export interface FileValidationResult {
  /** 识别到的可信 MIME；无法识别时为空。 */
  contentType?: string;
}

/** 可组合文件内容验证器。 */
export interface FileValidator {
  /** 验证器稳定名称。 */
  name: string;
  /** 验证器执行顺序，数值越小越先执行。 */
  order: number;
  /** 执行内容检测。 */
  validate: (input: FileValidationInput) => Promise<FileValidationResult>;
}
