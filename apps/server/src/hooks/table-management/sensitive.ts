const sensitiveNamePattern =
  /(password|passwd|pwd|secret|token|authorization|credential|private|hash|salt|key)$/i;

const largeTextPattern = /(detail|extra|logs?|content|payload|body|data)$/i;

/** 判断字段是否需要在 demo 数据中默认脱敏。 */
export function isSensitiveColumn({
  name,
  sqlType,
}: {
  /** 字段名。 */
  name: string;
  /** PostgreSQL SQL 类型。 */
  sqlType: string;
}) {
  const normalizedType = sqlType.toLowerCase();
  return (
    sensitiveNamePattern.test(name) ||
    normalizedType === 'bytea' ||
    (normalizedType === 'text' && largeTextPattern.test(name))
  );
}

/** 将敏感或大字段转换成可展示的摘要值。 */
export function maskPreviewValue({
  name,
  sqlType,
  value,
}: {
  /** 字段名。 */
  name: string;
  /** PostgreSQL SQL 类型。 */
  sqlType: string;
  /** 原始字段值。 */
  value: unknown;
}) {
  if (value === null || value === undefined) {
    return value;
  }

  if (isSensitiveColumn({ name, sqlType })) {
    const text =
      value instanceof Uint8Array || Buffer.isBuffer(value)
        ? `${value.byteLength} bytes`
        : String(value);
    return {
      masked: true,
      summary: text.length > 32 ? `${text.slice(0, 32)}...` : text,
    };
  }

  return value;
}
