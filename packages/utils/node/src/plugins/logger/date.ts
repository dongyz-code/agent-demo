/** 按本地时区格式化日志日期目录。 */
export function formatLogDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 判断目录名是否符合本地日志日期目录格式。 */
export function isLogDateDir(name: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}
