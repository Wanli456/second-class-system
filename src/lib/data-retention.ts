import { createHash } from 'node:crypto';
import type { AuthUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit-log';
import {
  lockTransactionKey,
  query,
  withTransaction,
  type DatabaseClient,
} from '@/storage/database/supabase-client';

const ACCOUNT_RETENTION_YEARS = 4;
const MAX_BATCH_SIZE = 100;

export type DisposalReason = 'manual_delete' | 'graduation';

export type RetentionActor = Pick<AuthUser, 'id' | 'username' | 'role'>;

export type AnonymizedCounts = {
  activities: number;
  activitySubmissions: number;
  leaveRequests: number;
  leaveSlips: number;
  originalLeaveSlips: number;
  attendanceWorkArrangements: number;
  auditLogs: number;
  uploadAssets: number;
  classRoster: number;
  leaveGroupMembers: number;
  leaveGroups: number;
};

export type RetentionIssue = {
  table: string;
  recordId: string;
  field: string;
  reason: 'INVALID_JSON' | 'UNSAFE_LEGACY_IDENTITY' | 'UNSAFE_OCR' | 'ATTACHMENT_REMAINS';
};

export type DisposeRegisteredUserResult = {
  deleted: boolean;
  alreadyDisposed: boolean;
  retainedFacts: boolean;
  reason: DisposalReason;
  targetId: string;
  anonymized: AnonymizedCounts;
  complete: boolean;
  unresolved: RetentionIssue[];
  error?: 'LAST_ADMIN' | 'DATABASE_FAILURE' | 'REVIEW_REQUIRED';
};

type StoredUser = {
  id: string;
  username: string;
  student_id: string;
  contact_phone: string | null;
  role: string;
  created_at: Date | string;
};

type InternalReason = DisposalReason | 'retention_expiry';
type InternalDisposeResult = Omit<DisposeRegisteredUserResult, 'reason'> & {
  reason: InternalReason;
  skipReason?: 'ADMIN' | 'NOT_ELIGIBLE';
};

export type RetentionCandidate = {
  id: string;
  createdAt: string;
  eligibleAtUtc: string;
  role: string;
  retentionStatus: 'eligible' | 'skipped_admin';
};

export type RetentionPreview = {
  limit: number;
  userCutoffUtc: string;
  users: RetentionCandidate[];
  skippedAdmins: RetentionCandidate[];
};

export type RetentionRunResult = {
  disposed: Array<{ id: string; anonymized: AnonymizedCounts }>;
  failed: Array<{ id: string; error: 'DATABASE_FAILURE' }>;
  reviewRequired: Array<{ id: string; anonymized: AnonymizedCounts; unresolved: RetentionIssue[] }>;
  skippedAdmins: string[];
};

function emptyCounts(): AnonymizedCounts {
  return {
    activities: 0,
    activitySubmissions: 0,
    leaveRequests: 0,
    leaveSlips: 0,
    originalLeaveSlips: 0,
    attendanceWorkArrangements: 0,
    auditLogs: 0,
    uploadAssets: 0,
    classRoster: 0,
    leaveGroupMembers: 0,
    leaveGroups: 0,
  };
}

export function anonymizedStudentId(recordId: string): string {
  const digest = createHash('sha256').update(recordId).digest().subarray(0, 8).toString('base64url');
  return `ANON:${digest}`;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(limit as number)));
}

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid users.created_at');
  return date;
}

export function utcCalendarYearDeadline(createdAt: Date, years = ACCOUNT_RETENTION_YEARS): Date {
  const targetYear = createdAt.getUTCFullYear() + years;
  const month = createdAt.getUTCMonth();
  const day = Math.min(
    createdAt.getUTCDate(),
    new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate(),
  );
  return new Date(Date.UTC(
    targetYear,
    month,
    day,
    createdAt.getUTCHours(),
    createdAt.getUTCMinutes(),
    createdAt.getUTCSeconds(),
    createdAt.getUTCMilliseconds(),
  ));
}

function toCandidate(user: StoredUser): RetentionCandidate {
  const createdAt = asDate(user.created_at);
  return {
    id: user.id,
    createdAt: createdAt.toISOString(),
    eligibleAtUtc: utcCalendarYearDeadline(createdAt).toISOString(),
    role: user.role,
    retentionStatus: user.role === 'admin' ? 'skipped_admin' : 'eligible',
  };
}

async function affected(client: DatabaseClient, sql: string, params: unknown[]): Promise<number> {
  return (await client.query<{ id: string }>(sql, params)).rows.length;
}

const OMIT = Symbol('omit');

type JsonRedaction = { value: string | null; matched: boolean; invalid: boolean };

function redactKnownBinding(value: unknown, userId: string, studentId: string): unknown | typeof OMIT {
  if (value === userId || value === studentId) return OMIT;
  if (Array.isArray(value)) {
    return value.map((item) => redactKnownBinding(item, userId, studentId)).filter((item) => item !== OMIT);
  }
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.id === userId || record.user_id === userId || record.userId === userId
    || record.student_id === studentId || record.studentId === studentId) return OMIT;
  return Object.fromEntries(Object.entries(record)
    .map(([key, item]) => [key, redactKnownBinding(item, userId, studentId)] as const)
    .filter(([, item]) => item !== OMIT));
}

function redactJsonText(value: string | null, userId: string, studentId: string): JsonRedaction {
  if (!value) return { value, matched: false, invalid: false };
  try {
    const parsed = JSON.parse(value);
    const redacted = redactKnownBinding(parsed, userId, studentId);
    const serialized = redacted === OMIT ? '[]' : JSON.stringify(redacted);
    return { value: serialized, matched: serialized !== JSON.stringify(parsed), invalid: false };
  } catch {
    return { value, matched: false, invalid: true };
  }
}

function jsonHasItems(value: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return !Array.isArray(parsed) || parsed.length > 0;
  } catch {
    return true;
  }
}

async function anonymizeStudentRows(
  client: DatabaseClient,
  table: 'leave_requests' | 'leave_group_members' | 'leave_slip_students',
  studentId: string,
): Promise<number> {
  const rows = await client.query<{ id: string }>(`SELECT id FROM ${table} WHERE student_id=$1`, [studentId]);
  for (const row of rows.rows) {
    const classPart = table === 'leave_requests' ? ",class_name='ANONYMIZED'" : '';
    await client.query(
      `UPDATE ${table} SET student_id=$1,student_name='ANONYMIZED'${classPart} WHERE id=$2`,
      [anonymizedStudentId(row.id), row.id],
    );
  }
  return rows.rows.length;
}

async function redactLeaderJson(client: DatabaseClient, table: 'activities' | 'activity_submissions', user: StoredUser, issues: RetentionIssue[]): Promise<number> {
  const rows = await client.query<{ id: string; leader_ids: string | null; leader_details: string | null; leader_name: string; leader_phone: string }>(
    `SELECT id,leader_ids,leader_details,leader_name,leader_phone FROM ${table}`,
  );
  let changed = 0;
  for (const row of rows.rows) {
    const leaderIds = redactJsonText(row.leader_ids, user.id, user.student_id);
    const leaderDetails = redactJsonText(row.leader_details, user.id, user.student_id);
    if (leaderIds.invalid) issues.push({ table, recordId: row.id, field: 'leader_ids', reason: 'INVALID_JSON' });
    if (leaderDetails.invalid) issues.push({ table, recordId: row.id, field: 'leader_details', reason: 'INVALID_JSON' });
    const legacyBound = row.leader_name === user.username
      && (row.leader_phone === user.student_id || row.leader_phone === user.contact_phone);
    const legacyMentionsTarget = row.leader_name.includes(user.username)
      || row.leader_phone === user.student_id
      || row.leader_phone === user.contact_phone;
    if (!legacyBound && legacyMentionsTarget) {
      issues.push({ table, recordId: row.id, field: 'leader_name/leader_phone', reason: 'UNSAFE_LEGACY_IDENTITY' });
    }
    if (!leaderIds.matched && !leaderDetails.matched && !legacyBound) continue;
    await client.query(
      `UPDATE ${table} SET leader_ids=$1,leader_details=$2,leader_name=$4,leader_phone=$5 WHERE id=$3`,
      [leaderIds.value, leaderDetails.value, row.id, legacyBound ? 'ANONYMIZED' : row.leader_name, legacyBound ? 'ANONYMIZED' : row.leader_phone],
    );
    changed += 1;
  }
  return changed;
}

async function preflightRetention(client: DatabaseClient, user: StoredUser): Promise<RetentionIssue[]> {
  const issues: RetentionIssue[] = [];

  for (const table of ['activities', 'activity_submissions'] as const) {
    const rows = await client.query<{ id: string; leader_ids: string | null; leader_details: string | null; leader_name: string; leader_phone: string }>(
      `SELECT id,leader_ids,leader_details,leader_name,leader_phone FROM ${table}`,
    );
    for (const row of rows.rows) {
      const ids = redactJsonText(row.leader_ids, user.id, user.student_id);
      const details = redactJsonText(row.leader_details, user.id, user.student_id);
      if (ids.invalid) issues.push({ table, recordId: row.id, field: 'leader_ids', reason: 'INVALID_JSON' });
      if (details.invalid) issues.push({ table, recordId: row.id, field: 'leader_details', reason: 'INVALID_JSON' });
      const legacyBound = row.leader_name === user.username
        && (row.leader_phone === user.student_id || row.leader_phone === user.contact_phone);
      const legacyMentionsTarget = row.leader_name.includes(user.username)
        || row.leader_phone === user.student_id
        || row.leader_phone === user.contact_phone;
      if (!legacyBound && legacyMentionsTarget) {
        issues.push({ table, recordId: row.id, field: 'leader_name/leader_phone', reason: 'UNSAFE_LEGACY_IDENTITY' });
      }
    }
  }

  const slips = await client.query<{ id: string; original_slip_id: string | null; ocr_names: string | null }>(
    `SELECT DISTINCT s.id,s.original_slip_id,s.ocr_names FROM leave_slips s
     JOIN leave_slip_students m ON m.slip_id=s.id WHERE m.student_id=$1`, [user.student_id],
  );
  for (const slip of slips.rows) {
    const slipOcr = redactJsonText(slip.ocr_names, user.id, user.student_id);
    if (slipOcr.invalid) issues.push({ table: 'leave_slips', recordId: slip.id, field: 'ocr_names', reason: 'INVALID_JSON' });
    else if (jsonHasItems(slip.ocr_names)) issues.push({ table: 'leave_slips', recordId: slip.id, field: 'ocr_names', reason: 'UNSAFE_OCR' });
    if (slip.original_slip_id) {
      const original = await client.query<{ ocr_names: string | null; student_names: string | null }>('SELECT ocr_names,student_names FROM original_leave_slips WHERE id=$1', [slip.original_slip_id]);
      const row = original.rows[0];
      if (row && (jsonHasItems(row.ocr_names) || jsonHasItems(row.student_names))) issues.push({ table: 'original_leave_slips', recordId: slip.original_slip_id, field: 'ocr_names/student_names', reason: 'UNSAFE_OCR' });
    }
  }
  const attendance = await client.query<{ id: string; student_names: string | null; schedules: string | null; ocr_names: string | null }>(
    'SELECT id,student_names,schedules,ocr_names FROM attendance_work_arrangements',
  );
  for (const row of attendance.rows) {
    const studentNames = redactJsonText(row.student_names, user.id, user.student_id);
    const schedules = redactJsonText(row.schedules, user.id, user.student_id);
    const ocrNames = redactJsonText(row.ocr_names, user.id, user.student_id);
    for (const [field, value] of [['student_names', studentNames], ['schedules', schedules], ['ocr_names', ocrNames] ] as const) {
      if (value.invalid) issues.push({ table: 'attendance_work_arrangements', recordId: row.id, field, reason: 'INVALID_JSON' });
    }
    if ((studentNames.matched || schedules.matched) && jsonHasItems(row.ocr_names)) issues.push({ table: 'attendance_work_arrangements', recordId: row.id, field: 'ocr_names', reason: 'UNSAFE_OCR' });
  }
  const originals = await client.query<{ id: string; ocr_names: string | null; student_names: string | null }>(
    'SELECT id,ocr_names,student_names FROM original_leave_slips WHERE created_by_user_id=$1', [user.id],
  );
  for (const row of originals.rows) {
    if (jsonHasItems(row.ocr_names) || jsonHasItems(row.student_names)) issues.push({ table: 'original_leave_slips', recordId: row.id, field: 'ocr_names/student_names', reason: 'UNSAFE_OCR' });
  }
  return issues;
}

async function redactAuditJson(client: DatabaseClient, user: StoredUser): Promise<number> {
  const rows = await client.query<{ id: string; details: unknown }>('SELECT id,details FROM audit_logs');
  let changed = 0;
  for (const row of rows.rows) {
    const redacted = redactKnownBinding(row.details, user.id, user.student_id);
    if (redacted === OMIT || JSON.stringify(redacted) !== JSON.stringify(row.details)) {
      await client.query('UPDATE audit_logs SET details=$1::jsonb WHERE id=$2', [JSON.stringify(redacted === OMIT ? {} : redacted), row.id]);
      changed += 1;
    }
  }
  return changed;
}

async function redactAttendanceJson(client: DatabaseClient, user: StoredUser, issues: RetentionIssue[]): Promise<number> {
  const rows = await client.query<{ id: string; student_names: string | null; schedules: string | null; ocr_names: string | null }>(
    'SELECT id,student_names,schedules,ocr_names FROM attendance_work_arrangements',
  );
  let changed = 0;
  for (const row of rows.rows) {
    const studentNames = redactJsonText(row.student_names, user.id, user.student_id);
    const schedules = redactJsonText(row.schedules, user.id, user.student_id);
    const ocrNames = redactJsonText(row.ocr_names, user.id, user.student_id);
    if (studentNames.invalid) issues.push({ table: 'attendance_work_arrangements', recordId: row.id, field: 'student_names', reason: 'INVALID_JSON' });
    if (schedules.invalid) issues.push({ table: 'attendance_work_arrangements', recordId: row.id, field: 'schedules', reason: 'INVALID_JSON' });
    if (ocrNames.invalid) issues.push({ table: 'attendance_work_arrangements', recordId: row.id, field: 'ocr_names', reason: 'INVALID_JSON' });
    const hasExplicitStudentBinding = studentNames.matched || schedules.matched;
    // OCR text normally stores names only. Once this arrangement is proven to
    // contain the target by an ID-bearing JSON field, clear its OCR list rather
    // than attempting an unsafe name match.
    const nextOcrNames = hasExplicitStudentBinding && jsonHasItems(row.ocr_names) ? row.ocr_names : ocrNames.value;
    if (hasExplicitStudentBinding && jsonHasItems(row.ocr_names)) issues.push({ table: 'attendance_work_arrangements', recordId: row.id, field: 'ocr_names', reason: 'UNSAFE_OCR' });
    if (studentNames.value === row.student_names && schedules.value === row.schedules && nextOcrNames === row.ocr_names) continue;
    await client.query(
      'UPDATE attendance_work_arrangements SET student_names=$1,schedules=$2,ocr_names=$3 WHERE id=$4',
      [studentNames.value, schedules.value, nextOcrNames, row.id],
    );
    changed += 1;
  }
  return changed;
}

async function disposeTarget(
  actor: RetentionActor | null,
  targetId: string,
  reason: InternalReason,
  automaticNow?: Date,
): Promise<InternalDisposeResult> {
  const defaults = { deleted: false, alreadyDisposed: false, retainedFacts: true, targetId, anonymized: emptyCounts(), complete: false, unresolved: [] as RetentionIssue[] };
  try {
    return await withTransaction(async (client) => {
      // Auth role mutation and account deletion use this same lock. Taking it
      // before the row lock closes the preview-to-execute promotion race.
      await lockTransactionKey(client, 'admin-role');
      const target = (await client.query<StoredUser>(
        'SELECT id,username,student_id,contact_phone,role,created_at FROM users WHERE id=$1 FOR UPDATE',
        [targetId],
      )).rows[0];
      if (!target) return { ...defaults, alreadyDisposed: true, reason };

      if (automaticNow) {
        if (target.role === 'admin') return { ...defaults, reason, skipReason: 'ADMIN' };
        if (utcCalendarYearDeadline(asDate(target.created_at)) > automaticNow) {
          return { ...defaults, reason, skipReason: 'NOT_ELIGIBLE' };
        }
      }

      if (target.role === 'admin') {
        const admins = await client.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM users WHERE role='admin'");
        if (Number(admins.rows[0]?.total || 0) <= 1) return { ...defaults, reason, error: 'LAST_ADMIN' };
      }

      const unresolved = await preflightRetention(client, target);
      if (unresolved.length) return { ...defaults, reason, unresolved, error: 'REVIEW_REQUIRED' };

      const anonymized = emptyCounts();
      anonymized.activities += await affected(client,
        `UPDATE activities SET activity_submitter_id=NULL,activity_submitter_name=NULL,activity_submitter_student_id=NULL,idempotency_key=NULL
         WHERE activity_submitter_id=$1 RETURNING id`, [target.id]);
      anonymized.activities += await affected(client,
        `UPDATE activities SET scoring_material_submitter_id=NULL,scoring_material_submitter_name=NULL,scoring_material_submitter_student_id=NULL,idempotency_key=NULL
         WHERE scoring_material_submitter_id=$1 RETURNING id`, [target.id]);
      anonymized.activities += await redactLeaderJson(client, 'activities', target, unresolved);
      anonymized.activitySubmissions += await affected(client,
        `UPDATE activity_submissions SET activity_submitter_id=NULL,activity_submitter_name=NULL,activity_submitter_student_id=NULL,idempotency_key=NULL
         WHERE activity_submitter_id=$1 RETURNING id`, [target.id]);
      anonymized.activitySubmissions += await affected(client,
        `UPDATE activity_submissions SET scoring_material_submitter_id=NULL,scoring_material_submitter_name=NULL,scoring_material_submitter_student_id=NULL,idempotency_key=NULL
         WHERE scoring_material_submitter_id=$1 RETURNING id`, [target.id]);
      anonymized.activitySubmissions += await redactLeaderJson(client, 'activity_submissions', target, unresolved);

      // The applicant and the student can be different people. Never clear a
      // represented student's identity merely because this account submitted it.
      anonymized.leaveRequests += await affected(client,
        `UPDATE leave_requests SET applicant_user_id=NULL,applicant_name=NULL,applicant_student_id=NULL
         WHERE applicant_user_id=$1 RETURNING id`, [target.id]);
      anonymized.leaveRequests += await anonymizeStudentRows(client, 'leave_requests', target.student_id);
      anonymized.leaveGroups += await affected(client,
        `UPDATE leave_groups SET applicant_user_id=NULL,applicant_name=NULL,applicant_student_id=NULL
         WHERE applicant_user_id=$1 RETURNING id`, [target.id]);
      anonymized.leaveGroups += await affected(client,
        `UPDATE leave_groups SET applicant_name=NULL,applicant_student_id=NULL
         WHERE applicant_user_id IS NULL AND applicant_student_id=$1 RETURNING id`, [target.student_id]);

      anonymized.leaveSlips += await affected(client,
        `UPDATE leave_slips SET applicant_user_id=NULL,applicant_name=NULL,applicant_student_id=NULL,idempotency_key=NULL
         WHERE applicant_user_id=$1 RETURNING id`, [target.id]);
      anonymized.leaveSlips += await affected(client,
        `UPDATE leave_slips SET applicant_name=NULL,applicant_student_id=NULL
         WHERE applicant_user_id IS NULL AND applicant_student_id=$1 RETURNING id`, [target.student_id]);
      anonymized.leaveSlips += await affected(client,
        `UPDATE leave_slips SET reviewed_by_user_id=NULL,reviewed_by_name=NULL,review_note=NULL
         WHERE reviewed_by_user_id=$1 RETURNING id`, [target.id]);
      const linkedSlips = await client.query<{ id: string; original_slip_id: string | null }>(
        `SELECT DISTINCT s.id,s.original_slip_id FROM leave_slips s
         JOIN leave_slip_students m ON m.slip_id=s.id WHERE m.student_id=$1`,
        [target.student_id],
      );
      anonymized.leaveGroupMembers += await anonymizeStudentRows(client, 'leave_group_members', target.student_id);
      anonymized.leaveSlips += await anonymizeStudentRows(client, 'leave_slip_students', target.student_id);
      anonymized.classRoster += await affected(client,
        'DELETE FROM class_roster WHERE student_id=$1 RETURNING id', [target.student_id]);

      for (const slip of linkedSlips.rows) {
        anonymized.leaveSlips += await affected(client,
          `UPDATE leave_slips SET ocr_names='[]' WHERE id=$1 RETURNING id`, [slip.id]);
        if (slip.original_slip_id) {
          anonymized.originalLeaveSlips += await affected(client,
            `UPDATE original_leave_slips SET ocr_names='[]',student_names='[]',notes=NULL WHERE id=$1 RETURNING id`,
            [slip.original_slip_id]);
        }
      }

      anonymized.originalLeaveSlips += await affected(client,
        `UPDATE original_leave_slips SET created_by_user_id=NULL,created_by_name=NULL,idempotency_key=NULL,notes=NULL
         WHERE created_by_user_id=$1 RETURNING id`, [target.id]);
      anonymized.attendanceWorkArrangements += await affected(client,
        `UPDATE attendance_work_arrangements SET created_by_user_id=NULL,created_by_name=NULL,idempotency_key=NULL
         WHERE created_by_user_id=$1 RETURNING id`, [target.id]);
      anonymized.attendanceWorkArrangements += await affected(client,
        `UPDATE attendance_work_arrangements SET reviewed_by_user_id=NULL,reviewed_by_name=NULL,review_note=NULL
         WHERE reviewed_by_user_id=$1 RETURNING id`, [target.id]);
      anonymized.attendanceWorkArrangements += await redactAttendanceJson(client, target, unresolved);

      anonymized.auditLogs += await affected(client,
        'UPDATE audit_logs SET actor_user_id=NULL,actor_name=NULL WHERE actor_user_id=$1 RETURNING id', [target.id]);
      anonymized.auditLogs += await affected(client,
        'UPDATE audit_logs SET resource_id=NULL WHERE resource_id=$1 RETURNING id', [target.id]);
      anonymized.auditLogs += await redactAuditJson(client, target);
      anonymized.uploadAssets += await affected(client,
        'UPDATE upload_assets SET uploaded_by_user_id=NULL WHERE uploaded_by_user_id=$1 RETURNING url', [target.id]);
      await affected(client, 'DELETE FROM notifications WHERE user_id=$1 RETURNING id', [target.id]);
      await client.query('DELETE FROM users WHERE id=$1', [target.id]);
      await writeAuditLog({
        actor,
        action: 'data_retention.dispose_registered_user',
        resourceType: 'data_retention',
        details: { reason, anonymized },
      }, client);
      return {
        deleted: true,
        alreadyDisposed: false,
        retainedFacts: true,
        complete: unresolved.length === 0,
        unresolved,
        reason,
        targetId,
        anonymized,
        ...(unresolved.length ? { error: 'REVIEW_REQUIRED' as const } : {}),
      };
    });
  } catch (error) {
    return { ...defaults, reason, error: 'DATABASE_FAILURE' };
  }
}

export async function disposeRegisteredUser(
  actor: RetentionActor,
  targetId: string,
  reason: DisposalReason,
): Promise<DisposeRegisteredUserResult> {
  const result = await disposeTarget(actor, targetId, reason);
  const { reason: _internalReason, skipReason: _skipReason, ...publicResult } = result;
  return { ...publicResult, reason };
}

export async function previewDataRetention(options: { limit?: number; now?: Date } = {}): Promise<RetentionPreview> {
  const now = options.now ?? new Date();
  const limit = normalizeLimit(options.limit);
  const cutoff = utcCalendarYearDeadline(now, -ACCOUNT_RETENTION_YEARS);
  const candidateUpperBound = new Date(cutoff.getTime() + 24 * 60 * 60 * 1000);
  const [eligibleRows, adminRows] = await Promise.all([
    query<StoredUser>(
      `SELECT id,username,student_id,role,created_at FROM users
       WHERE role<>'admin' AND created_at <= $1 ORDER BY created_at,id LIMIT $2`,
      [candidateUpperBound, limit],
    ),
    query<StoredUser>(
      `SELECT id,username,student_id,role,created_at FROM users
       WHERE role='admin' AND created_at <= $1 ORDER BY created_at,id LIMIT $2`,
      [candidateUpperBound, limit],
    ),
  ]);
  const users = eligibleRows
    .filter((user) => utcCalendarYearDeadline(asDate(user.created_at)) <= now)
    .map(toCandidate);
  const skippedAdmins = adminRows
    .filter((user) => utcCalendarYearDeadline(asDate(user.created_at)) <= now)
    .map(toCandidate);
  return {
    limit,
    userCutoffUtc: cutoff.toISOString(),
    users,
    skippedAdmins,
  };
}

export async function runDataRetention(options: { actor: RetentionActor | null; limit?: number; now?: Date }): Promise<RetentionRunResult> {
  const preview = await previewDataRetention(options);
  const disposed: RetentionRunResult['disposed'] = [];
  const failed: RetentionRunResult['failed'] = [];
  const reviewRequired: RetentionRunResult['reviewRequired'] = [];
  for (const candidate of preview.users) {
    const result = await disposeTarget(options.actor, candidate.id, 'retention_expiry', options.now ?? new Date());
    if (result.skipReason === 'ADMIN') {
      preview.skippedAdmins.push({ ...candidate, role: 'admin', retentionStatus: 'skipped_admin' });
      continue;
    }
    if (result.skipReason === 'NOT_ELIGIBLE') continue;
    if (result.deleted || result.alreadyDisposed) {
      if (result.deleted && result.complete) disposed.push({ id: candidate.id, anonymized: result.anonymized });
      else if (result.deleted) reviewRequired.push({ id: candidate.id, anonymized: result.anonymized, unresolved: result.unresolved });
      continue;
    }
    if (result.error === 'REVIEW_REQUIRED') {
      reviewRequired.push({ id: candidate.id, anonymized: result.anonymized, unresolved: result.unresolved });
      continue;
    }
    failed.push({ id: candidate.id, error: 'DATABASE_FAILURE' });
  }
  return { disposed, failed, reviewRequired, skippedAdmins: preview.skippedAdmins.map((candidate) => candidate.id) };
}
