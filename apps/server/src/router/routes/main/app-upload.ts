import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { fse } from '@repo/utils-node';
import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { ROOT_ERROR } from '@/configs/index.js';
import { getAppDir, TEMP_DIRS } from '@/configs/dirs.js';

import type { ApiMain } from '@/types/index.js';
import type { SqlInsertData } from '@/database/index.js';

const { api } = routerHandler({
  url: '/main/app-upload',
  method: 'POST',
  handler: async ({ request, now }) => {
    let info: ApiMain.AiAppUploadInfo | null = null;
    let fileCount = 0;

    const tempDir = await TEMP_DIRS.get();
    const file = join(tempDir, '1.zip');

    try {
      for await (const chunk of request.parts()) {
        if (chunk.type === 'file') {
          fileCount += 1;
          if (fileCount > 1) {
            throw new ROOT_ERROR('非法参数', '只能上传一个文件');
          }
          await pipeline(chunk.file, createWriteStream(file));
          if (chunk.file.truncated) {
            throw new ROOT_ERROR('文件上传失败', '文件大小超过限制');
          }
        } else if (chunk.type === 'field' && chunk.fieldname === 'info') {
          try {
            info = JSON.parse(chunk.value as string);
          } catch {
            throw new ROOT_ERROR('非法参数', 'info 不是合法 JSON');
          }
        }
      }
      if (fileCount !== 1) {
        throw new ROOT_ERROR('非法参数', '缺少上传文件');
      }
      if (!info) {
        throw new ROOT_ERROR('非法参数', '缺少 info 字段');
      }
      if (
        !info.id ||
        !info.name ||
        !Number.isFinite(info.size) ||
        info.size <= 0 ||
        !/^[a-fA-F0-9]{64}$/.test(info.hash)
      ) {
        throw new ROOT_ERROR('非法参数', 'info 字段格式不正确');
      }
      const { id, hash, size, name } = info;
      const val: SqlInsertData['ai_app_version'] = {
        id,
        hash: Buffer.from(hash, 'hex'),
        size: '' + size,
        name,
        create_timestamp: now,
      };
      const { historyDir } = getAppDir(id);
      const dest = join(historyDir, `${hash}.zip`);

      if (await fse.exists(dest)) {
        throw new Error('版本已存在');
      }

      await fse.move(file, dest, {
        overwrite: true,
      });

      await db.insert(schema.ai_app_version).values(val);
    } finally {
      await fse.remove(tempDir);
    }

    return 'ok';
  },
});

export default api;
