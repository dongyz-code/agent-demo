import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';

import type {
  FastifyInstance,
  FastifyServerOptions,
  RouteOptions,
} from './types.js';

/** 可通过 false 显式关闭的 Fastify 插件配置。 */
type OptionalPluginOptions<T> = false | T;

/** 创建 Fastify 实例所需配置。 */
export type CreateFastifyOpts = {
  /** Fastify 及基础插件配置。 */
  fastify: {
    /** Fastify 原生实例配置。 */
    options?: FastifyServerOptions;
    /** CORS 插件配置；传 false 可关闭。 */
    cors?: OptionalPluginOptions<Parameters<typeof cors>[1]>;
    /** cookie 插件配置；传 false 可关闭。 */
    cookie?: OptionalPluginOptions<Parameters<typeof cookie>[1]>;
    /** formbody 插件配置；传 false 可关闭。 */
    formbody?: OptionalPluginOptions<Parameters<typeof formbody>[1]>;
    /** multipart 插件配置；传 false 可关闭。 */
    multipart?: OptionalPluginOptions<Parameters<typeof multipart>[1]>;
    /** 需要注册的 route 列表。 */
    routes?: RouteOptions[];
    /** route 注册前执行的回调，适合安装插件和全局 hook。 */
    callback?: (fastify: FastifyInstance) => void | Promise<void>;
  };
  /** 监听配置。 */
  configs: {
    /** 监听端口。 */
    listen: number;
    /** 监听成功后的回调。 */
    callback?: (body: { listen: number; fastify: FastifyInstance }) => void;
  };
  /** route 注册后、listen 前执行的异步回调。 */
  awaitCallback?: (fastify: FastifyInstance) => void | Promise<void>;
};

/** 默认 multipart 限制，避免内部服务无边界接收上传内容。 */
const DEFAULT_MULTIPART_LIMITS = {
  fileSize: 100 * 1024 * 1024,
  files: 10,
};

/** 合并 multipart 默认限制和调用方配置。 */
function getMultipartOptions(opts: CreateFastifyOpts['fastify']['multipart']) {
  if (opts === false) {
    return false;
  }
  return {
    ...opts,
    limits: {
      ...DEFAULT_MULTIPART_LIMITS,
      ...opts?.limits,
    },
  };
}

/** 创建并启动 Fastify 服务。 */
export async function createFastify({
  fastify: opts,
  configs,
  awaitCallback,
}: CreateFastifyOpts) {
  const fastify = Fastify(opts.options);

  if (opts.cors !== false) {
    await fastify.register(cors, opts.cors ?? {});
  }
  if (opts.cookie !== false) {
    await fastify.register(cookie, opts.cookie ?? {});
  }
  if (opts.formbody !== false) {
    await fastify.register(formbody, opts.formbody ?? {});
  }
  const multipartOptions = getMultipartOptions(opts.multipart);
  if (multipartOptions !== false) {
    await fastify.register(multipart, multipartOptions);
  }

  await opts.callback?.(fastify);

  opts.routes?.forEach((route) => {
    fastify.route(route);
  });

  await awaitCallback?.(fastify);

  await fastify.listen({
    port: configs.listen,
    host: '0.0.0.0',
  });

  configs.callback?.({ listen: configs.listen, fastify });

  return fastify;
}

/** 旧拼写兼容导出；新代码应使用 createFastify。 */
export const creatFastify = createFastify;
