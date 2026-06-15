import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createGunzip, createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fse } from '../../utils/runtime.js';

import type { ZlibOptions } from 'node:zlib';

export const getOsTempDir = () => mkdtemp(join(tmpdir(), 'ndjson-'));

type NdGzipJsonOptions = {
  getTempDir?: () => string | Promise<string>;
};

type Step<T> = (body: {
  /** 数据 */
  item: T;
  /** 序号 */
  index: number;
  /** 关闭 */
  close: () => void;
}) => void;

export class NdGz {
  private getTempDir: NonNullable<NdGzipJsonOptions['getTempDir']>;
  constructor(opts?: NdGzipJsonOptions) {
    this.getTempDir = opts?.getTempDir ?? getOsTempDir;
  }
  /** 将文件进行 gzip 压缩, 输出到另一个文件 */
  fileGz({
    source,
    target,
    zlibOptions,
  }: {
    /** 源文件 */
    source: string;
    /** 目标文件 */
    target: string;
    /** GZIP 压缩选项 */
    zlibOptions?: ZlibOptions;
  }) {
    return pipeline(
      createReadStream(source),
      createGzip(zlibOptions),
      createWriteStream(target),
    );
  }
  /** 数组 to ndjson 文件（字符串数组请设置 stringify = false），不清空 data */
  async arrToNd({
    data,
    target,
    stringify = true,
  }: {
    /** 数据 */
    data: unknown[];
    /** 目标文件 */
    target: string;
    /** 是否转换为 JSON 字符串，默认转换 */
    stringify?: boolean;
  }) {
    if (!data.length) {
      throw new Error('data is empty');
    }

    await new Promise(async (resolve, reject) => {
      const maxLen = data.length;

      const writeStream = createWriteStream(target);
      writeStream.on('error', reject);
      writeStream.on('close', () => resolve(1));

      let index = 0;

      function writeData(data: any[]) {
        for (let i = index; i < maxLen; i++) {
          const ok = writeStream.write(
            stringify ? `${JSON.stringify(data[i])}\n` : `${data[i]}\n`,
          );
          index += 1;
          if (index === maxLen) {
            writeStream.end();
            return;
          }
          if (!ok) {
            writeStream.once('drain', () => writeData(data));
            break;
          }
        }
      }

      try {
        writeData(data);
      } catch (error) {
        reject(error);
        writeStream.destroy();
      }
    });
  }
  /** 数组 to ndjson gz 文件（字符串数组请设置 stringify = false），不清空 data */
  async arrToNdGz({
    data,
    target,
    stringify,
    zlibOptions,
  }: {
    /** 数据 */
    data: unknown[];
    /** 目标文件 */
    target: string;
    /** 是否转换为 JSON 字符串，默认转换 */
    stringify?: boolean;
    /** GZIP 压缩选项 */
    zlibOptions?: ZlibOptions;
  }) {
    if (!data.length) {
      throw new Error('data is empty');
    }

    const tempDir = await this.getTempDir();
    const tempNdJson = join(tempDir, 'ndjson.json');

    try {
      await this.arrToNd({
        data,
        target: tempNdJson,
        stringify,
      });
      await this.fileGz({
        source: tempNdJson,
        target,
        zlibOptions,
      });
    } finally {
      await fse.remove(tempDir);
    }
  }
  /** 数组 to ndjson gz Buffer（字符串数组请设置 stringify = false），不清空 data */
  async arrToNdGzBuffer({
    data,
    stringify,
    zlibOptions,
  }: {
    /** 数据 */
    data: unknown[];
    /** 是否转换为 JSON 字符串，默认转换 */
    stringify?: boolean;
    /** GZIP 压缩选项 */
    zlibOptions?: ZlibOptions;
  }) {
    if (!data.length) {
      throw new Error('data is empty');
    }

    const tempDir = await this.getTempDir();
    const tempNdJson = join(tempDir, 'ndjson.json');
    const target = join(tempDir, 'ndjson.gz');

    try {
      await this.arrToNd({
        data,
        target: tempNdJson,
        stringify,
      });
      await this.fileGz({
        source: tempNdJson,
        target,
        zlibOptions,
      });
      return await readFile(target);
    } finally {
      await fse.remove(tempDir);
    }
  }
  /** gzip ndjson 文件 to 对象数组 或者自定义处理逻辑 */
  async gzToArr<T>({
    source,
    parse = true,
    step,
  }: {
    /** 源文件 */
    source: string;
    /** 是否从 json 字符串转换回来 */
    parse?: boolean;
    /** 每行自定义处理逻辑, 设置后，返回的 list 是空数组 */
    step?: Step<T>;
  }) {
    const readStream = createReadStream(source);
    const decompressedStream = readStream.pipe(createGunzip());

    try {
      return await new Promise<T[]>((resolve, reject) => {
        const list: any[] = [];

        const rl = createInterface({
          input: decompressedStream,
          terminal: false,
        });
        rl.on('close', () => {
          resolve(list);
        });

        let isClose = false;
        const close = () => {
          if (isClose) {
            return;
          }
          isClose = true;
          rl.close();
        };

        let i = 0;

        if (step) {
          rl.on('line', (line) => {
            try {
              step({ item: parse ? JSON.parse(line) : line, index: i, close });
              i += 1;
            } catch (error) {
              reject(error);
              close();
            }
          });
        } else {
          rl.on('line', (line) => {
            i += 1;
            try {
              list.push(parse ? JSON.parse(line) : line);
            } catch (error) {
              reject(error);
              close();
            }
          });
        }
      });
    } finally {
      readStream.destroy();
      decompressedStream.destroy();
    }
  }
  /** gzip ndjson buffer to 对象数组 或者自定义处理逻辑 */
  async gzBufferToArr<T>({
    buffer,
    ...rest
  }: {
    buffer: Buffer;
    /** 是否从 json 字符串转换回来 */
    parse?: boolean;
    /** 每行自定义处理逻辑, 设置后，返回的 list 是空数组 */
    step?: Step<T>;
  }) {
    const tempDir = await this.getTempDir();
    const source = join(tempDir, 'ndjson.gz');
    await fse.writeFile(source, buffer, 'binary');

    try {
      return await this.gzToArr({
        source,
        ...rest,
      });
    } finally {
      await fse.remove(tempDir);
    }
  }
}
