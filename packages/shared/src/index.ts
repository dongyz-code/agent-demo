/**
 * 跨端共享运行时能力入口。
 *
 * 该包只承载 admin、server、client 等运行环境都能安全消费的常量、
 * 类型、轻量规则和纯函数。不要在这里引入数据库访问、Fastify 请求对象、
 * 浏览器组件状态或任何单端专属副作用。
 */
export * from './permission/index.js';
export type * from './permission/index.js';
