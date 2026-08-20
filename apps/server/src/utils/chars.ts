/**
 * 服务端公共字符常量。
 *
 * 一律用 String.fromCharCode 构造，避免在源码里直接书写该控制字符的
 * 字面转义序列：经工具参数的 JSON 解析后，这类字面会被注入成真实
 * NUL 字节，进而使 grep/Edit 等后续编辑失配。需要该字符处统一引用
 * 本常量，不再手写转义。
 */

/** ASCII NUL（U+0000）：文档对象键的分隔符，兼作需清除的无效字节。 */
export const NUL = String.fromCharCode(0);
