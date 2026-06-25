import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import '@fastify/multipart';
import { pathToFileURL } from 'node:url';
import { join, relative, sep } from 'node:path';
import { readdir } from 'node:fs/promises';

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
  RouteOptions,
} from 'fastify';
import type { CookieSerializeOptions } from '@fastify/cookie';

export type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RouteOptions,
  FastifySchema,
} from 'fastify';

type ApiItem = {
  method: string;
  req: unknown;
  resp: unknown;
};

type UnionToIntersection<T> = (
  T extends unknown ? (arg: T) => void : never
) extends (arg: infer R) => void
  ? R
  : never;

type JoinPath<Prefix extends string, Key extends string> =
  `${Prefix}${Key}` extends `/${infer Rest}` ? `/${Rest}` : `${Prefix}${Key}`;

type ApiTreeToList<T, Prefix extends string = ''> = UnionToIntersection<
  {
    [K in keyof T]: K extends string
      ? T[K] extends ApiItem
        ? { [P in JoinPath<Prefix, K>]: T[K] }
        : ApiTreeToList<T[K], JoinPath<Prefix, K>>
      : never;
  }[keyof T]
>;

type Merge<T, K> = Omit<T, keyof K> & K;

export type APISource<T extends { routes: Record<string, unknown> }> =
  ApiTreeToList<T['routes']>;

export type APIRoutes<
  T extends { prefix: string; routes: Record<string, unknown> },
  Provide extends { headers?: Record<string, unknown> } = {},
> = {
  prefix: T['prefix'];
  routes: {
    [K in keyof APISource<T>]: K extends string
      ? APISource<T>[K] extends ApiItem
        ? Merge<
            RouteOptions,
            {
              method: APISource<T>[K]['method'];
              url: K;
              handler: (
                request: Merge<
                  FastifyRequest,
                  APISource<T>[K]['method'] extends 'POST'
                    ? {
                        body: APISource<T>[K]['req'];
                        headers: Merge<
                          FastifyRequest['headers'],
                          Provide['headers']
                        >;
                      }
                    : {
                        query: APISource<T>[K]['req'];
                        headers: Merge<
                          FastifyRequest['headers'],
                          Provide['headers']
                        >;
                      }
                >,
                reply: FastifyReply,
              ) => Promise<APISource<T>[K]['resp']>
            }
          >
        : never
      : never;
  };
};

export const fastifyHooks = {
  setErrorHandler(fastify: FastifyInstance) {
    fastify.setErrorHandler(function (error, _request, reply) {
      this.log.error(error);
      reply.send(error);
    });
  },
  preSerialization(fastify: FastifyInstance) {
    fastify.addHook('preSerialization', async (_request, _reply, payload) => ({
      data: payload,
    }));
  },
};

export function cookieSign({
  reply,
  cookies,
  cookieSerializeOptions,
}: {
  reply: FastifyReply;
  cookies: Record<string, string>;
  cookieSerializeOptions?: CookieSerializeOptions;
}) {
  Object.entries(cookies).forEach(([name, value]) => {
    reply.setCookie(name, value, cookieSerializeOptions);
  });
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return await collectFiles(path);
      }
      if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) {
        return [path];
      }
      return [];
    }),
  );
  return files.flat().sort((a, b) => {
    const normalizedA = a.replace(/[^A-Za-z0-9]/g, '');
    const normalizedB = b.replace(/[^A-Za-z0-9]/g, '');
    return normalizedA.localeCompare(normalizedB) || a.localeCompare(b);
  });
}

function routeExportName(dir: string, file: string) {
  const parsed = relative(dir, file)
    .replace(/\.(ts|js)$/, '')
    .split(sep)
    .map((part) => part.replace(/[^A-Za-z0-9_$]/g, '_'))
    .join('_');
  return `routes_${parsed}`;
}

export async function mergeAPIByDir({
  dir,
  target,
  ext = '.ts',
  esm = true,
}: {
  dir: string;
  target?: string;
  ext?: string;
  esm?: boolean;
}) {
  const files = await collectFiles(dir);
  const lines = ['/** 此文件自动生成，请勿修改 */'];
  files.forEach((file) => {
    const rel = './' + relative(join(dir, '..'), file).replaceAll(sep, '/');
    const modulePath = rel.replace(/\.(ts|js)$/, esm ? '.js' : ext);
    lines.push(`export { default as ${routeExportName(dir, file)} } from '${modulePath}';`);
  });
  const content = lines.join('\n') + '\n';
  if (target) {
    const { fse } = await import('../../utils/runtime.js');
    await fse.writeFile(target, content, 'utf8');
  }
  return content;
}

export async function getAPIBySingleFile({
  file,
  prefix = '',
  log,
}: {
  file: string;
  prefix?: string;
  log?: boolean;
}) {
  const module = (await import(pathToFileURL(file).href)) as Record<
    string,
    RouteOptions
  >;
  const routes = Object.values(module).map((route) => ({
    ...route,
    url: `${prefix}${route.url}`,
  }));
  if (log) {
    console.table(routes.map(({ method, url }) => ({ method, url })));
  }
  return routes;
}

type CreateFastifyOpts = {
  fastify: {
    options?: FastifyServerOptions;
    cors?: Parameters<typeof cors>[1];
    cookie?: Parameters<typeof cookie>[1];
    routes?: RouteOptions[];
    callback?: (fastify: FastifyInstance) => void | Promise<void>;
  };
  configs: {
    listen: number;
    callback?: (body: { listen: number; fastify: FastifyInstance }) => void;
  };
  awaitCallback?: (fastify: FastifyInstance) => void | Promise<void>;
};

export async function creatFastify({
  fastify: opts,
  configs,
  awaitCallback,
}: CreateFastifyOpts) {
  const fastify = Fastify(opts.options);

  await fastify.register(cors, opts.cors ?? {});
  await fastify.register(cookie, opts.cookie ?? {});
  await fastify.register(formbody);
  await fastify.register(multipart);

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
