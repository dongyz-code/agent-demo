// 路由模块的统一导出：使用方一律从 '@/router' 引入，不要走深路径。
// 内部文件之间仍用 './xxx' 相对导入，避免绕回 barrel 形成循环依赖。
export * from './type';
export * from './routes';
export * from './methods';
export * from './permission';
export * from './guard';
export { router } from './instance';
