import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { fse } from '@repo/utils-node';
import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { getAppDir, TEMP_DIRS } from '@/configs/dirs.js';

import type { ApiMain } from '@/types/index.js';
import type { SqlInsertData } from '@/database/index.js';

const { api } = routerHandler({
  url: '/main/app-upload',
  method: 'POST',
  handler: async ({ request, now }) => {
    let info: ApiMain.AiAppUploadInfo | null = null;

    const tempDir = await TEMP_DIRS.get();
    const file = join(tempDir, '1.zip');

    try {
      for await (const chunk of request.parts()) {
        if (chunk.type === 'file') {
          await pipeline(chunk.file, createWriteStream(file));
        } else if (chunk.type === 'field' && chunk.fieldname === 'info') {
          info = JSON.parse(chunk.value as string);
        }
      }
      if (info) {
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
      }
    } finally {
      await fse.remove(tempDir);
    }

    return 'ok';
  },
});

export default api;
