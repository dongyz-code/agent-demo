import crypto from 'node:crypto';
import { parse } from 'node:path';
import { DIRS, ROOT } from '@/configs/index.js';

import type { BinaryLike } from 'node:crypto';

export function getSha256Hex(data: BinaryLike) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function getMd5Hex(data: BinaryLike) {
  return crypto.createHash('md5').update(data).digest('hex');
}

/** 文件基础地址
 *
 * 1. 如果是本地开发, 则使用文件服务器
 * 2. 如果是线上DOCKER，则使用NGINX文件服务（http, 仍然需要指定内网IP）
 * 3. 如果是AWS ECS, 则完全使用公共服务（http, 仍然需要指定域名）
 *
 */

/** 获取后端文件地址
 *
 * 1. 考虑加密的话，加上加密参数
 * 2. 本地使用 server-handler
 * 3. 服务器使用 nginx
 *
 */
export function getStaticUrl(filePath: string) {
  if (!filePath) {
    return '';
  }

  const urlParse = parse(filePath);
  filePath = urlParse.dir + '/' + encodeURIComponent(urlParse.base);

  const temp = filePath.replace(DIRS.STATIC, '').replace(/\\/g, '/');

  let prefix = '';

  if (ROOT.APP_PROD) {
    prefix = '/static';
  }

  return `${prefix}${temp}`;
}
