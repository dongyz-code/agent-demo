import { S3Client } from '@aws-sdk/client-s3';

import { ROOT } from '@/configs/index.js';

let internalClient: S3Client | undefined;
let publicSigningClient: S3Client | undefined;

/** 返回服务端执行对象命令的内部 S3 客户端。 */
export function getInternalS3Client(): S3Client {
  internalClient ??= createClient(ROOT.upload.internalEndpoint);
  return internalClient;
}

/** 返回按浏览器可达 Endpoint 生成签名的 S3 客户端。 */
export function getPublicSigningS3Client(): S3Client {
  publicSigningClient ??= createClient(ROOT.upload.publicEndpoint);
  return publicSigningClient;
}

/** 使用相同凭证和 path-style 规则创建 S3 客户端。 */
function createClient(endpoint: string): S3Client {
  const config = ROOT.upload;
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });
}
