/**
 * 1. 获取配置文件
 * 2. 启动服务
 *
 * 数据库迁移请使用 db:migrate 显式执行，避免多实例启动时重复执行 DDL。
 */
async function init() {
  await import('./server.js');
}

init().catch((error) => {
  console.error(error);
  process.exit(1);
});
