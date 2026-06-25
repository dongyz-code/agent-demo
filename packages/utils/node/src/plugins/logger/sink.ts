import pino from 'pino';

/** Pino 写入目标的最小接口，便于 stdout 和文件使用同一出口。 */
export type LogWriter = {
  /** 写入单行 Pino JSON 日志。 */
  write: (line: string) => void;
  /** 刷新底层缓冲区，文件流可选实现。 */
  flush?: () => void;
  /** 关闭底层资源，stdout 不应关闭。 */
  end?: () => void;
  /** 当前写入的文件路径，stdout 没有该字段。 */
  file?: string;
};

/** 创建 stdout writer；开发环境可输出更易读的文本，生产保持 JSON。 */
export function createStdoutWriter(pretty: boolean): LogWriter {
  if (!pretty) {
    return {
      write(line) {
        process.stdout.write(line);
      },
    };
  }

  return {
    write(line) {
      process.stdout.write(formatPrettyLine(line));
    },
  };
}

/** 创建本地文件 writer，文件内容始终保持 Pino JSON 行。 */
export function createFileWriter(file: string): LogWriter {
  const destination = pino.destination({
    dest: file,
    mkdir: true,
    sync: false,
  });
  return {
    file,
    write(line) {
      destination.write(line);
    },
    flush() {
      destination.flush?.();
    },
    end() {
      destination.end?.();
    },
  };
}

/** 创建可替换文件流的角色 sink，让 Pino logger 本身不需要重建。 */
export function createRoleSink(stdout?: LogWriter) {
  let fileWriter: LogWriter | undefined;

  const sink = {
    write(line: string) {
      stdout?.write(line);
      fileWriter?.write(line);
    },
    setFile(nextFileWriter?: LogWriter) {
      closeWriter(fileWriter);
      fileWriter = nextFileWriter;
    },
    getFile() {
      return fileWriter?.file;
    },
    flush() {
      fileWriter?.flush?.();
    },
    close() {
      closeWriter(fileWriter);
      fileWriter = undefined;
    },
  };

  return sink;
}

/** 安静关闭 writer，避免日志降级路径再次依赖 logger。 */
export function closeWriter(writer: LogWriter | undefined) {
  if (!writer) {
    return;
  }
  try {
    writer.flush?.();
    writer.end?.();
  } catch (error) {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
  }
}

/** 将 Pino JSON 行转换为开发环境可读文本；解析失败时原样输出。 */
function formatPrettyLine(line: string) {
  try {
    const data = JSON.parse(line) as Record<string, unknown>;
    const time =
      typeof data.time === 'number'
        ? new Date(data.time).toISOString()
        : String(data.time ?? '');
    const level = String(data.level ?? 'info').toUpperCase();
    const role = data.role ? ` [${String(data.role)}]` : '';
    const msg = data.msg ? ` ${String(data.msg)}` : '';
    const extra = { ...data };
    delete extra.level;
    delete extra.time;
    delete extra.role;
    delete extra.msg;
    const detail = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
    return `${time} ${level}${role}${msg}${detail}\n`;
  } catch {
    return line;
  }
}
