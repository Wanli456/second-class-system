import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/storage/database/supabase-client';
import { DEPARTMENT_AUTO_PERMISSIONS, parsePermissionOverrides } from '@/lib/department-permissions';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'second_class_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const FALLBACK_SECRET = 'second-class-local-development-secret';

function sessionCookieOptions(request?: NextRequest) {
  const forwardedProtocol = request?.headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();
  const requestProtocol = forwardedProtocol || (request ? new URL(request.url).protocol.replace(':', '') : null);
  const configuredSecure = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  const secure = configuredSecure === 'true'
    ? true
    : configuredSecure === 'false'
      ? false
      : requestProtocol
        ? requestProtocol === 'https'
        : process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
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
  can_register_other_college: boolean;
  can_review_leave: boolean;
  can_view_evening_study: boolean;
  can_start_group_leave: boolean;
  can_manage_attendance_work: boolean;
  can_upload_leave: boolean;
  can_query_leave: boolean;
  can_manage_original_leave: boolean;
  can_submit_original_leave: boolean;
  contact_phone?: string | null;
  department?: string | null;
  class_name?: string | null;
  permission_overrides?: string | null;
};

export type BaseRole = 'admin' | 'leader' | 'class_leader' | 'student';

export function normalizeRole(role: unknown): BaseRole {
  if (role === 'admin' || role === 'leader' || role === 'class_leader' || role === 'student') return role;
  // Legacy capability roles are retained only as data migration compatibility.
  return 'student';
}

function secret() {
  if (process.env.AUTH_SESSION_SECRET) return process.env.AUTH_SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) throw new Error('生产环境缺少 AUTH_SESSION_SECRET，拒绝使用固定会话密钥');
  return FALLBACK_SECRET;
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
 * 2. 业务能力由独立权限字段控制，基础角色不再绑定审核、赋分或请假权限
 * 3. 部门负责人（leader）按所属部门自动获得该部门的默认权限组
 * 4. 其余用户由管理员逐项授予；管理员拥有全部权限
 */
function calculateUserPermissions(user: AuthUser) {
  const role = normalizeRole(user.role);
  const isAdmin = role === 'admin';
  const isLeader = role === 'leader';
  const department = (user.department || '').trim();
  const autoPerms = (isLeader && DEPARTMENT_AUTO_PERMISSIONS[department]) || {};
  const overrides = parsePermissionOverrides(user.permission_overrides);

  const permission = (
    key: 'canPublish' | 'canScore' | 'canSubmitActivity' | 'canViewSubmissionStatus' | 'canSubmitScoring' | 'canRegisterOtherCollege' | 'canReviewLeave' | 'canViewEveningStudy' | 'canStartGroupLeave' | 'canManageAttendanceWork' | 'canUploadLeave' | 'canQueryLeave' | 'canManageOriginalLeave' | 'canSubmitOriginalLeave',
    raw: boolean,
    fallback: boolean,
  ) => {
    if (isAdmin) return true;
    if (typeof overrides[key] === 'boolean') return overrides[key]!;
    return fallback || raw || autoPerms[key] === true;
  };

  return {
    id: user.id,
    studentId: user.student_id,
    name: user.username,
    role,
    department: user.department || null,
    className: user.class_name || null,
    contactPhone: user.contact_phone || null,
    permissionOverrides: user.permission_overrides || null,
    // 权限计算：admin OR 管理员手动覆盖 OR 部门自动权限 OR 手动勾选权限
    canPublish: permission('canPublish', user.can_publish, false),
    canScore: permission('canScore', user.can_score, false),
    canReviewLeave: permission('canReviewLeave', user.can_review_leave, false),
    canSubmitActivity: permission('canSubmitActivity', user.can_submit_activity, false),
    canViewSubmissionStatus: permission('canViewSubmissionStatus', user.can_view_submission_status, false),
    canSubmitScoring: permission('canSubmitScoring', user.can_submit_scoring, false),
    canRegisterOtherCollege: permission('canRegisterOtherCollege', user.can_register_other_college, false),
    canViewEveningStudy: permission('canViewEveningStudy', user.can_view_evening_study, false),
    canStartGroupLeave: permission('canStartGroupLeave', user.can_start_group_leave, false),
    canManageAttendanceWork: permission('canManageAttendanceWork', user.can_manage_attendance_work, false),
    canUploadLeave: permission('canUploadLeave', user.can_upload_leave, false),
    canQueryLeave: permission('canQueryLeave', user.can_query_leave, false),
    canManageOriginalLeave: permission('canManageOriginalLeave', user.can_manage_original_leave, false),
    canSubmitOriginalLeave: permission('canSubmitOriginalLeave', user.can_submit_original_leave, false),
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
    `SELECT id, username, student_id, role, can_publish, can_score, can_submit_activity, can_view_submission_status, can_submit_scoring, can_register_other_college, can_review_leave, can_view_evening_study, can_start_group_leave, can_manage_attendance_work, can_upload_leave, can_query_leave, can_manage_original_leave, can_submit_original_leave, department, class_name, contact_phone, permission_overrides
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
export async function requirePermission(request: NextRequest, permission: 'admin' | 'publish' | 'submitActivity' | 'viewSubmissionStatus' | 'score' | 'submitScoring' | 'registerOtherCollege' | 'reviewLeave' | 'eveningStudy' | 'startGroupLeave' | 'manageAttendanceWork' | 'uploadLeave' | 'queryLeave' | 'manageOriginalLeave' | 'submitOriginalLeave') {
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
      registerOtherCollege: 'canRegisterOtherCollege' as const,
      reviewLeave: 'canReviewLeave' as const,
      eveningStudy: 'canViewEveningStudy' as const,
      startGroupLeave: 'canStartGroupLeave' as const,
      manageAttendanceWork: 'canManageAttendanceWork' as const,
      uploadLeave: 'canUploadLeave' as const,
      queryLeave: 'canQueryLeave' as const,
      manageOriginalLeave: 'canManageOriginalLeave' as const,
      submitOriginalLeave: 'canSubmitOriginalLeave' as const,
    };

    const permissionKey = permissionMap[permission];
    allowed = !!permissions[permissionKey];
  }

  if (!allowed) {
    return { user: null, response: NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 }) };
  }
  return { user, response: null };
}

export function setSessionCookie(response: NextResponse, userId: string, token = createSessionToken(userId), request?: NextRequest) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    ...sessionCookieOptions(request),
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse, request?: NextRequest) {
  response.cookies.set({ name: SESSION_COOKIE, value: '', ...sessionCookieOptions(request), maxAge: 0 });
}
