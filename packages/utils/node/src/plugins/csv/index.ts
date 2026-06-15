import { createWriteStream } from 'node:fs';
import { writeToString } from 'fast-csv';
import { initQueueTask } from '@/index.js';

import type { FormatterOptionsArgs, FormatterRow } from 'fast-csv';

/** 写入CSV移除换行符号
 *
 * \f：换页符
 * \n：换行符
 * \r：回车符
 * \t：制表符
 * \v：垂直制表符
 * \u2028：行分隔符（LS）
 * \u2029：段落分隔符（PS）
 *
 */
export function removeChar(val: string | undefined) {
  return (val ?? '').trim().replace(/[\f\n\r\t\v\u2028\u2029]/g, '');
}

/** 允许增量写入 CSV 文件，写入完成后手动调用 done 函数
 *
 * 一定会写入头部字段
 */
export function useCsvAppendWrite({
  file,
  options,
}: {
  file: string;
  options?: FormatterOptionsArgs<FormatterRow, FormatterRow>;
}) {
  const writeStream = createWriteStream(file);
  writeStream.on('error', (error) => {
    throw error;
  });

  /** csv 头部字段是否已经写入 */
  let isHeaderWrite = false;

  /** 分步写入数据到 CSV 文件 */
  async function _write(data: any[]) {
    if (!data.length) {
      return;
    }
    const str = await writeToString(data, {
      ...options,
      headers: !isHeaderWrite,
    });
    await new Promise((resolve, reject) => {
      writeStream.write(isHeaderWrite ? '\n' + str : str, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve('success');
        }
      });
    });
    isHeaderWrite = true;
  }

  /** 结束可写流 */
  async function done() {
    await new Promise((resolve) => {
      writeStream.on('finish', () => resolve(1));
      writeStream.end();
    });
  }

  /** 避免写入冲突，强制写入队列为 1 */
  const write = initQueueTask(_write, {
    worker: 1,
  });

  return {
    /** 写入数据到 CSV 文件 */
    write,
    /** 结束可写流 */
    done,
  };
}
