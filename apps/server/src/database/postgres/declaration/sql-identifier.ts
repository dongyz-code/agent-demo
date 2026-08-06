/**
 * SQL 标识符校验：表定义层（presets 拼 trigger 名）与迁移层（descriptor/ddl 拼索引/函数名）共用。
 * 放在 tables/ 是因为标识符命名随表定义，迁移层按"迁移→定义"方向 import。
 */
export function validateSqlIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${label}格式不合法`);
  }
}
