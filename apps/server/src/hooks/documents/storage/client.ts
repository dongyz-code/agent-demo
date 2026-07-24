import { S3Client } from '@aws-sdk/client-s3';

import { ROOT } from '@/configs/index.js';

let internalClient: S3Client | undefined;
let publicSigningClient: S3Client | undefined;

/** 去尾斜杠归一化 endpoint：S3 签名依赖 Host/Path 一致。 */
function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** 返回服务端执行对象命令的内部 S3 客户端。 */
export function getInternalS3Client(): S3Client {
  internalClient ??= createClient(ROOT.storage.s3.internalEndpoint);
  return internalClient;
}

/** 返回按浏览器可达 Endpoint 生成签名的 S3 客户端。 */
export function getPublicSigningS3Client(): S3Client {
  publicSigningClient ??= createClient(ROOT.storage.s3.publicEndpoint);
  return publicSigningClient;
}

/** 使用相同凭证和 path-style 规则创建 S3 客户端。 */
function createClient(endpoint: string): S3Client {
  const s3 = ROOT.storage.s3;
  return new S3Client({
    endpoint: normalizeEndpoint(endpoint),
    region: s3.region?.trim() || 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: s3.accessKey,
      secretAccessKey: s3.secretKey,
    },
  });
}
