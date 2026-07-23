/** 将字节数格式化为适合文档表格展示的单位。 */
export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KiB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MiB`;
  return `${(size / 1024 ** 3).toFixed(1)} GiB`;
}

/** 将接口日期转换为本地时间文案。 */
export function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString();
}
