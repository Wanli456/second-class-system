/**
 * 联系方式（手机号 / 微信号）校验。
 *
 * 用户可以在个人中心自行填写，避免管理员逐个代填；
 * 部门负责人的联系方式是必填项，用于请假、活动等工作联系。
 */

export const CONTACT_PHONE_MIN_LENGTH = 5;
export const CONTACT_PHONE_MAX_LENGTH = 30;

// 手机号或微信号：数字、字母，以及常见的分隔符号。
const CONTACT_PHONE_PATTERN = /^[0-9A-Za-z+\-_() ]+$/;

export function normalizeContactPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

export type ContactPhoneValidation =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export function validateContactPhoneInput(value: unknown): ContactPhoneValidation {
  const normalized = normalizeContactPhone(value);
  if (!normalized) return { ok: true, value: null };
  if (normalized.length < CONTACT_PHONE_MIN_LENGTH || normalized.length > CONTACT_PHONE_MAX_LENGTH) {
    return { ok: false, error: `联系方式长度需要在 ${CONTACT_PHONE_MIN_LENGTH}-${CONTACT_PHONE_MAX_LENGTH} 位之间` };
  }
  if (!CONTACT_PHONE_PATTERN.test(normalized)) {
    return { ok: false, error: '联系方式只能包含数字、字母、+、-、下划线、括号和空格' };
  }
  if (!/[0-9A-Za-z]/.test(normalized)) {
    return { ok: false, error: '请填写有效的手机号或微信号' };
  }
  return { ok: true, value: normalized };
}