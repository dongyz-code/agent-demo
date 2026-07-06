import { HASH_CHUNK_SIZE } from './constants';
import { createSHA256, createMD5 } from 'hash-wasm';

type ParamsBase = {
  /** 文件 */
  file: File;
  /** 分块大小 */
  chunkSize?: number;
  /** 计算方法 */
  method: 'md5' | 'sha256';
};

export type ParamsMethod = ParamsBase & {
  /** 0-1 (计算进度) */
  progressFn?: (progress: number) => void;
};

export type Message =
  | { key: 'error'; data: unknown }
  | { key: 'progress'; data: number }
  | {
      key: 'result';
      data: { hex: string; base64: string; binary: Uint8Array };
    };

export type ParamsWorker = ParamsBase & {
  emit: (msg: Message) => void;
};

async function hash({
  file,
  method,
  chunkSize = HASH_CHUNK_SIZE,
  emit,
}: ParamsWorker) {
  const hasher = method === 'sha256' ? await createSHA256() : await createMD5();
  hasher.init();

  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    const buffer = await chunk.arrayBuffer();
    hasher.update(new Uint8Array(buffer));

    emit({ key: 'progress', data: (i + 1) / totalChunks });
  }

  const binary = hasher.digest('binary');

  const hex = Array.from(binary)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  emit({
    key: 'result',
    data: {
      hex,
      base64: btoa(String.fromCharCode(...binary)),
      binary,
    },
  });
}

self.addEventListener(
  'message',
  async ({ data }) => {
    const emit = self.postMessage as ParamsWorker['emit'];
    hash({ ...data, emit }).catch((error) => {
      emit({ key: 'error', data: error });
    });
  },
  false,
);
