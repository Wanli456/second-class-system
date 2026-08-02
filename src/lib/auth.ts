import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/storage/database/supabase-client';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'second_class_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const FALLBACK_SECRET = 'second-class-local-development-secret';

export type AuthUser = {
  id: string;
  username: string;
  student_id: string;
  role: string;
  can_publish: boolean;
  can_score: boolean;
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

export function publicUser(user: AuthUser) {
  const isAdmin = user.role === 'admin';
  return {
    id: user.id,
    studentId: user.student_id,
    name: user.username,
    role: user.role,
    canPublish: isAdmin || user.can_publish,
    canScore: isAdmin || user.can_score,
    canSubmitScoring: isAdmin || user.can_submit_scoring,
    canReviewLeave: isAdmin || user.can_review_leave,
    canViewEveningStudy: isAdmin || user.can_view_evening_study,
  };
}

export async function getSessionUser(request: NextRequest): Promise<AuthUser | null> {
  const userId = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return queryOne(
    `SELECT id, username, student_id, role, can_publish, can_score, can_submit_scoring, can_review_leave, can_view_evening_study
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

export async function requirePermission(request: NextRequest, permission: 'admin' | 'publish' | 'score' | 'submitScoring' | 'reviewLeave' | 'eveningStudy') {
  const result = await requireUser(request);
  if (result.response) return result;

  const user = result.user!;
  const allowed = permission === 'admin'
    ? user.role === 'admin'
    : user.role === 'admin'
      || (permission === 'publish' && user.can_publish)
      || (permission === 'score' && user.can_score)
      || (permission === 'submitScoring' && user.can_submit_scoring)
      || (permission === 'reviewLeave' && (user.role === 'leave_reviewer' || user.can_review_leave))
      || (permission === 'eveningStudy' && user.can_view_evening_study);

  if (!allowed) {
    return { user: null, response: NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 }) };
  }
  return { user, response: null };
}

export function setSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: serializeSession(userId),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({ name: SESSION_COOKIE, value: '', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
}
