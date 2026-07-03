/**
 * 1. 获取配置文件
 * 2. 启动服务
 *
 * 启动时会做一次表结构自检：缺失的表自动建，字段与 schema 不一致的只打印警告不改库
 * （见 startupSchemaSync）。已有表的索引/trigger 同步走前端 sync 操作，列结构变更走 reset。
 */
async function init() {
  await import('./server.js');
}

init().catch((error) => {
  console.error(error);
  process.exit(1);
});
