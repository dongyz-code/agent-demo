/**
 * 1. 获取配置文件
 * 2. 初始化数据库
 * 3. 启动服务
 */
async function init() {
  const { runMigrations } = await import('@/database/index.js');
  await runMigrations();
  await import('./server.js');
}

init().catch((error) => {
  console.error(error);
  process.exit(1);
});
