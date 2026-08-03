/** 文件内容类型，用于区分不同格式族及其处理方式。 */
export type ContentType =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'pdf'
  | 'word'
  | 'ppt'
  | 'excel';

/** 单种文件格式的扩展名与 MIME 配置。 */
interface ContentTypeItem {
  /** 同一种文件格式支持的不带点小写扩展名。 */
  extensions: readonly [string, ...string[]];
  /** 首项是规范 MIME，其余项用于兼容浏览器声明和签名检测结果。 */
  mime: readonly [string, ...string[]];
}

/**
 * 文件扩展名与 MIME 的唯一手写配置源。
 *
 * 顶层按业务文件类型分类。向空分类加入格式即表示系统开始接受该类文件，
 * 调用方不得再维护额外的扩展名或 MIME 白名单。
 */
export const contentTypeConfig = {
  image: [
    {
      extensions: ['jpg', 'jpeg'],
      mime: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
    },
    {
      extensions: ['png'],
      mime: ['image/png', 'image/x-png'],
    },
    {
      extensions: ['webp'],
      mime: ['image/webp'],
    },
  ],
  video: [],
  audio: [],
  text: [
    {
      extensions: ['txt'],
      mime: ['text/plain'],
    },
    {
      extensions: ['md'],
      mime: ['text/markdown', 'text/x-markdown', 'text/plain'],
    },
    {
      extensions: ['csv'],
      mime: ['text/csv', 'application/csv', 'text/x-csv', 'text/plain'],
    },
  ],
  pdf: [
    {
      extensions: ['pdf'],
      mime: ['application/pdf', 'application/x-pdf'],
    },
  ],
  word: [
    {
      extensions: ['doc'],
      mime: [
        'application/msword',
        'application/x-msword',
        'application/vnd.ms-word',
        'application/x-cfb',
      ],
    },
    {
      extensions: ['docx'],
      mime: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    },
  ],
  ppt: [
    {
      extensions: ['ppt'],
      mime: [
        'application/vnd.ms-powerpoint',
        'application/mspowerpoint',
        'application/powerpoint',
        'application/x-mspowerpoint',
        'application/x-cfb',
      ],
    },
    {
      extensions: ['pptx'],
      mime: [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
    },
  ],
  excel: [
    {
      extensions: ['xls'],
      mime: [
        'application/vnd.ms-excel',
        'application/msexcel',
        'application/x-msexcel',
        'application/x-ms-excel',
        'application/x-excel',
        'application/x-cfb',
      ],
    },
    {
      extensions: ['xlsx'],
      mime: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    },
  ],
} as const satisfies Record<ContentType, readonly ContentTypeItem[]>;

/** 无法提供具体文件 MIME 时使用的通用二进制传输类型。 */
export const binaryContentType = 'application/octet-stream';

/** 配置对象中的单种文件格式。 */
type ConfiguredContentTypeItem =
  (typeof contentTypeConfig)[keyof typeof contentTypeConfig][number];

/** 配置对象实际注册的全部文件扩展名。 */
export type SupportedFileExtension =
  ConfiguredContentTypeItem['extensions'][number];

/** 按扩展名查询时返回的文件分类和 MIME。 */
interface ContentTypeByExtensionItem {
  /** 扩展名所属的业务文件分类。 */
  type: ContentType;
  /** 当前扩展名接受的 MIME，首项为规范值。 */
  mime: readonly [string, ...string[]];
}

/** 配置对象的分类和格式条目，供派生索引遍历。 */
const contentTypeEntries = Object.entries(contentTypeConfig) as [
  ContentType,
  readonly ContentTypeItem[],
][];

/**
 * 扩展名到文件分类和 MIME 的唯一派生索引。
 *
 * 所有扩展名白名单必须通过 Object.keys(contentTypesByExtension) 获取。
 */
export const contentTypesByExtension = Object.fromEntries(
  contentTypeEntries.flatMap(([type, items]) =>
    items.flatMap((item) =>
      item.extensions.map(
        (extension) =>
          [extension, { type, mime: item.mime }] as const,
      ),
    ),
  ),
) as Readonly<
  Record<SupportedFileExtension, ContentTypeByExtensionItem>
>;

/**
 * 提取注册表支持的不带点小写文件扩展名。
 *
 * @param filename 用户上传时提供的文件名。
 * @returns 注册表支持的小写扩展名；缺失或不支持时返回空。
 */
export function getFileExtension(
  filename: string,
): SupportedFileExtension | undefined {
  const index = filename.lastIndexOf('.');
  if (index < 0) return undefined;
  const extension = filename.slice(index + 1).toLowerCase();
  if (!Object.hasOwn(contentTypesByExtension, extension)) return undefined;
  return extension as SupportedFileExtension;
}
