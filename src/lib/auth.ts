import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/storage/database/supabase-client';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'second_class_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const FALLBACK_SECRET = 'second-class-local-development-secret';

function sessionCookieOptions() {
  // Coze renders previews in an embedded cross-site frame. Production cookies
  // must opt into that context or protected API requests lose the session.
  const isProduction = process.env.NODE_ENV === 'production' || process.env.COZE_PROJECT_ENV === 'PROD';
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' as const : 'lax' as const,
    secure: isProduction,
    path: '/',
  };
}

export type AuthUser = {
  id: string;
  username: string;
  student_id: string;
  role: string;
  can_publish: boolean;
  can_score: boolean;
  can_submit_activity: boolean;
  can_view_submission_status: boolean;
  can_submit_scoring: boolean;
  can_review_leave: boolean;
  can_view_evening_study: boolean;
};

function secret() {
  return process.env.AUTH_SESSION_SECRET || FALLBACK_SECRET;
}

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function serializeSession(userId: string) {
  const payload = `${userId}.${Date.now() + SESSION_TTL_SECONDS * 1000}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

export function createSessionToken(userId: string) {
  return serializeSession(userId);
}

function readSession(value?: string | null) {
  if (!value) return null;
  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) return null;

  try {
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const expected = sign(payload);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const separator = payload.lastIndexOf('.');
    const userId = payload.slice(0, separator);
    const expiresAt = Number(payload.slice(separator + 1));
    return userId && expiresAt > Date.now() ? userId : null;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith('scrypt$')) return password === stored;
  const [, salt, expectedHex] = stored.split('$');
  if (!salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * 统一权限计算函数
 *
 * 权限规则：
 * 1. admin角色拥有所有权限
 * 2. 特殊角色（publisher、scorer、leave_reviewer）需要同时满足：role匹配 + 对应勾选权限启用
 *    这样管理员可以通过取消勾选来覆盖角色权限
 * 3. 普通权限只能通过勾选控制
 */
function calculateUserPermissions(user: AuthUser) {
  const isAdmin = user.role === 'admin';

  return {
    id: user.id,
    studentId: user.student_id,
    name: user.username,
    role: user.role,
    // 权限计算：admin OR (角色权限 AND 勾选权限)
    canPublish: isAdmin ||
      (user.role === 'publisher' && user.can_publish) ||
      user.can_publish,

    canScore: isAdmin ||
      (user.role === 'scorer' && user.can_score) ||
      user.can_score,

    canReviewLeave: isAdmin ||
      (user.role === 'leave_reviewer' && user.can_review_leave) ||
      user.can_review_leave,

    // 普通权限：仅通过勾选控制
    canSubmitActivity: isAdmin || user.can_submit_activity,
    canViewSubmissionStatus: isAdmin || user.can_view_submission_status,
    canSubmitScoring: isAdmin || user.can_submit_scoring,
    canViewEveningStudy: isAdmin || user.can_view_evening_study,
  };
}

export function publicUser(user: AuthUser) {
  return calculateUserPermissions(user);
}

// 导出函数供测试使用
export { calculateUserPermissions };

export async function getSessionUser(request: NextRequest): Promise<AuthUser | null> {
  const authorization = request.headers.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const userId = readSession(request.cookies.get(SESSION_COOKIE)?.value) || readSession(bearerToken);
  if (!userId) return null;
  return queryOne(
    `SELECT id, username, student_id, role, can_publish, can_score, can_submit_activity, can_view_submission_status, can_submit_scoring, can_review_leave, can_view_evening_study
     FROM users WHERE id = $1`,
    [userId],
  );
}

export async function requireUser(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return { user: null, response: NextResponse.json({ success: false, error: 'Please log in first' }, { status: 401 }) };
  }
  return { user, response: null };
}

/**
 * 权限检查函数 - 使用统一的权限计算
 */
export async function requirePermission(request: NextRequest, permission: 'admin' | 'publish' | 'submitActivity' | 'viewSubmissionStatus' | 'score' | 'submitScoring' | 'reviewLeave' | 'eveningStudy') {
  const result = await requireUser(request);
  if (result.response) return result;

  const user = result.user!;
  const permissions = calculateUserPermissions(user);

  let allowed = false;

  if (permission === 'admin') {
    allowed = user.role === 'admin';
  } else {
    // 使用计算后的权限进行检查
    const permissionMap = {
      publish: 'canPublish' as const,
      submitActivity: 'canSubmitActivity' as const,
      viewSubmissionStatus: 'canViewSubmissionStatus' as const,
      score: 'canScore' as const,
      submitScoring: 'canSubmitScoring' as const,
      reviewLeave: 'canReviewLeave' as const,
      eveningStudy: 'canViewEveningStudy' as const,
    };

    const permissionKey = permissionMap[permission];
    allowed = !!permissions[permissionKey];
  }

  if (!allowed) {
    return { user: null, response: NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 }) };
  }
  return { user, response: null };
}

export function setSessionCookie(response: NextResponse, userId: string, token = createSessionToken(userId)) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    ...sessionCookieOptions(),
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({ name: SESSION_COOKIE, value: '', ...sessionCookieOptions(), maxAge: 0 });
}
