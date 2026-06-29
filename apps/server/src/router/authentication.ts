import { initAuthentication } from '@repo/utils-node';
import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { countRows, db, schema, whereAll } from '@/database/index.js';
import { assertRouteAdminPermission } from '@/hooks/admin-permission/index.js';
import { eq } from 'drizzle-orm';

import type { CookieData, TokenData } from '@/types/index.js';

const interfaceRoutePrefix = '/api/interface/';

const baseAuthentication = initAuthentication<{
  token: TokenData;
  cookie: CookieData;
}>({
  jwt: {
    expire: ROOT.authorization.jwt_exp,
    secret: ROOT.authorization.jwt_secret,
  },
  prod: ROOT.APP_PROD,
  opts: {
    cookieModel: {
      token: '',
    },
    SET_ERROR: () => new ROOT_ERROR('认证: 身份校验失败'),
    ignore: [
      {
        url: '/favicon.ico',
        method: 'GET',
      },
      {
        url: '/.well-known/',
        role: 'startsWith',
        method: 'GET',
      },
      {
        url: '/api/login/login',
        method: 'POST',
      },
    ],
    async basicAuth({ id, secret, request }) {
      if (request.url.startsWith(interfaceRoutePrefix) && id.length === 36) {
        // TODO: 优化
        const count = await countRows(
          schema.apps,
          whereAll(
            eq(schema.apps.client_id, id),
            eq(schema.apps.client_secret, secret),
          ),
        );

        if (count) {
          /** 更新最后登录时间 */
          await db
            .update(schema.apps)
            .set({
              last_login_timestamp: new Date(),
            })
            .where(eq(schema.apps.client_id, id));

          return { client_id: id };
        }
      }
    },
  },
});

export const authentication = {
  ...baseAuthentication,
  /** 完成身份认证后执行 routeHandler 声明的 admin 权限校验。 */
  async authentication(request: Parameters<typeof baseAuthentication.authentication>[0]) {
    await baseAuthentication.authentication(request);
    await assertRouteAdminPermission(request);
  },
};
