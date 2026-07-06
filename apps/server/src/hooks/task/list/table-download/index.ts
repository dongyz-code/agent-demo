import { run, useCsvAppendWrite } from '@repo/utils-node';
import { join } from 'node:path';
import { db, schema, sql } from '@/database/index.js';
import { TEMP_DIRS } from '@/configs/dirs.js';
import { getStaticUrl } from '@/utils/index.js';

import type { TableDownload } from './type.js';

run(async ({ logger }) => {
  let { table, target } = JSON.parse(process.argv[2]) as TableDownload;

  if (!target) {
    const tempDir = await TEMP_DIRS.get();
    target = join(tempDir, `${table}.csv`);
  }

  const csv = useCsvAppendWrite({ file: target });

  const promiseList: Promise<void>[] = [];

  const temp: any[] = [];

  const write = async (list: any[]) => {
    if (list.length) {
      await csv.write(list);
      list.length = 0;
    }
  };

  const push = (row: any) => {
    temp.push(row);

    if (temp.length >= 1e4) {
      const vals = temp.slice();
      temp.length = 0;
      promiseList.push(write(vals));
    }
  };

  if (!(table in schema.managedTableRegistry)) {
    throw new Error(`未知表名: ${table}`);
  }

  const result = await db.execute<Record<string, unknown>>(
    sql`select * from ${sql.identifier(table)}`,
  );
  result.rows.forEach(push);

  promiseList.push(write(temp));

  await Promise.all(promiseList);

  await csv.done();

  console.log(getStaticUrl(target));
});
