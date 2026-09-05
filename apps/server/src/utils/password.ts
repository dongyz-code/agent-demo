import { argon2id, hash, verify } from 'argon2';

/** Argon2id 编码的标准前缀，用于识别已经迁移的密码凭据。 */
const ARGON2ID_PREFIX = '$argon2id$';

/**
 * 判断数据库值是否为本服务生成的 Argon2id 编码。
 *
 * @param value 数据库中的密码字段。
 * @returns 以 Argon2id 前缀开头时返回 true。
 */
export function isArgon2idHash(value: string) {
  return value.startsWith(ARGON2ID_PREFIX);
}

/**
 * 生成普通用户密码的 Argon2id 哈希。
 *
 * @param password 用户提交的原文密码，不会被记录或返回。
 * @returns 可直接保存到 user.password 的 Argon2id 编码。
 * @throws 密码为空时抛出非法参数错误。
 */
export async function hashPassword(password: string) {
  if (!password) {
    throw new Error('Password must not be empty');
  }

  return hash(password, { type: argon2id });
}

/**
 * 校验原文密码与 Argon2id 哈希是否匹配。
 *
 * @param passwordHash 数据库中的 Argon2id 编码。
 * @param password 用户提交的原文密码。
 * @returns 凭据匹配且编码有效时返回 true；格式错误按不匹配处理。
 */
export async function verifyPassword(
  passwordHash: string,
  password: string,
) {
  if (!isArgon2idHash(passwordHash) || !password) {
    return false;
  }

  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
