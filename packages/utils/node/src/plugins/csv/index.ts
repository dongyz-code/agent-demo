import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { format } from 'fast-csv';

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

/** 允许增量流式写入 CSV 文件，写入完成后手动调用 done 函数。
 *
 * 默认会写入头部字段；调用 done 后不允许继续写入。
 */
export function useCsvAppendWrite<Row extends FormatterRow = FormatterRow>({
  file,
  options,
}: {
  /** CSV 文件写入路径。 */
  file: string;
  /** fast-csv 格式化配置，默认 headers 为 true，可显式覆盖。 */
  options?: FormatterOptionsArgs<Row, Row>;
}) {
  const fileStream = createWriteStream(file);
  const csvStream = format<Row, Row>({
    headers: true,
    ...options,
  });
  /** 是否已经开始关闭，开始关闭后拒绝新的写入请求。 */
  let isEnding = false;
  /** 文件流是否已经关闭完成。 */
  let isClosed = false;
  /** 写入过程中的第一个失败原因，done 会继续向调用方抛出。 */
  let failure: unknown;
  /** 串行写入链，避免并发写同一个文件流造成顺序错乱。 */
  let writeTail = Promise.resolve();

  csvStream.pipe(fileStream);

  csvStream.on('error', (error) => {
    failure ??= error;
  });
  fileStream.on('error', (error) => {
    failure ??= error;
  });

  /** 获取统一的关闭后写入错误。 */
  function createClosedError() {
    return new Error('CSV 写入流已关闭，不能继续写入');
  }

  /** 确认当前还能接受新的写入任务。 */
  function assertAcceptingWrite() {
    if (failure) {
      throw failure;
    }
    if (isEnding || isClosed) {
      throw createClosedError();
    }
  }

  /** 确认文件流仍可继续执行队列中的写入。 */
  function assertStreamReady() {
    if (failure) {
      throw failure;
    }
  }

  /** 记录写入失败原因，保证后续 write 和 done 能得到同一个错误。 */
  function rememberFailure(error: unknown) {
    failure ??= error;
  }

  /** 等待 fast-csv 处理背压，期间任一底层流报错都会让当前写入失败。 */
  async function waitDrain() {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        rememberFailure(error);
        cleanup();
        reject(error);
      };
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        csvStream.off('drain', onDrain);
        csvStream.off('error', onError);
        fileStream.off('error', onError);
      };

      csvStream.once('drain', onDrain);
      csvStream.once('error', onError);
      fileStream.once('error', onError);
    });
  }

  /** 写入单行 CSV 数据，必要时等待底层流释放背压。 */
  async function writeRow(row: Row) {
    assertStreamReady();
    try {
      if (!csvStream.write(row)) {
        await waitDrain();
      }
    } catch (error) {
      rememberFailure(error);
      throw error;
    }
    assertStreamReady();
  }

  /** 分步写入数据到 CSV 文件 */
  async function writeBatch(data: Row[]) {
    if (!data.length) {
      return;
    }
    for (const row of data) {
      await writeRow(row);
    }
  }

  /** 写入数据到 CSV 文件，多个调用会按调用顺序串行执行。 */
  function write(data: Row[]) {
    try {
      assertAcceptingWrite();
    } catch (error) {
      return Promise.reject(error);
    }

    const rows = data.slice();
    const task = writeTail.then(() => writeBatch(rows));
    writeTail = task.catch((error) => {
      rememberFailure(error);
    });
    return task;
  }

  /** 结束可写流 */
  async function done() {
    if (isClosed) {
      if (failure) {
        throw failure;
      }
      return;
    }

    isEnding = true;
    await writeTail;

    if (failure) {
      isClosed = true;
      csvStream.destroy(failure instanceof Error ? failure : undefined);
      fileStream.destroy(failure instanceof Error ? failure : undefined);
      throw failure;
    }

    csvStream.end();
    try {
      await Promise.all([finished(csvStream), finished(fileStream)]);
      isClosed = true;
    } catch (error) {
      rememberFailure(error);
      isClosed = true;
      throw error;
    }
  }

  return {
    /** 写入数据到 CSV 文件 */
    write,
    /** 结束可写流 */
    done,
  };
}
