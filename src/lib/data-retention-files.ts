import { lstat, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { AuthUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit-log';
import { query, queryOne, withTransaction, type DatabaseClient } from '@/storage/database/supabase-client';

const RETENTION_DAYS = 180;
const UPLOAD_PREFIX = '/uploads/';
const QUARANTINE_DIR = '.data-retention-quarantine';
const JOB_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

export type FileReference = { kind: string; recordId: string };
type AssetRow = { url: string; uploaded_by_user_id: string | null; purpose: string; created_at: Date | null };
type ImageRow = { id: string; image_list: string | null };
type JobRow = { id: string; asset_url: string; status: string; staged_path: string | null };
type PendingDatabaseStatus = 'pending_database_manual_confirmed' | 'pending_database_automatic';
type RegisteredJob = { job: JobRow; created: boolean };

export function isManagedUploadUrl(url: string): boolean {
  return /^\/uploads\/[^/\\?#]+$/.test(url) && !url.includes('..');
}

export function resolveManagedUploadPath(root: string, url: string): string {
  if (!isManagedUploadUrl(url)) throw new Error('Only managed /uploads files are eligible');
  const uploads = path.resolve(root, 'public', 'uploads');
  const resolved = path.resolve(uploads, url.slice(UPLOAD_PREFIX.length));
  if (path.dirname(resolved) !== uploads) throw new Error('Invalid managed upload path');
  return resolved;
}

type FileInfo = { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean };

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export function assertRegularFile(info: Pick<FileInfo, 'isFile' | 'isSymbolicLink'>, label: string): void {
  if (!info.isFile()) throw new Error(info.isSymbolicLink() ? 'Refusing symbolic link' : label + ' is not a regular file');
}

function assertDirectory(info: Pick<FileInfo, 'isDirectory' | 'isSymbolicLink'>, label: string): void {
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(info.isSymbolicLink() ? 'Refusing symbolic link directory' : label + ' is not a directory');
}

async function assertRealDirectory(directory: string, label: string): Promise<void> {
  assertDirectory(await lstat(directory), label);
}

async function assertUploadDirectories(root: string): Promise<void> {
  await assertRealDirectory(path.resolve(root), 'Upload root');
  await assertRealDirectory(path.resolve(root, 'public'), 'Public directory');
  await assertRealDirectory(path.resolve(root, 'public', 'uploads'), 'Uploads directory');
}

async function assertQuarantineDirectory(root: string, required: boolean): Promise<boolean> {
  try {
    await assertRealDirectory(path.resolve(root, QUARANTINE_DIR), 'Cleanup quarantine directory');
    return true;
  } catch (error) {
    if (!required && isEnoent(error)) return false;
    throw error;
  }
}

async function regularFileExists(file: string, label: string): Promise<boolean> {
  try {
    assertRegularFile(await lstat(file), label);
    return true;
  } catch (error) {
    if (isEnoent(error)) return false;
    throw error;
  }
}

function quarantinePath(root: string, jobId: string): string {
  if (!JOB_ID_PATTERN.test(jobId)) throw new Error('Invalid cleanup job');
  return path.resolve(root, QUARANTINE_DIR, jobId);
}

export async function stageManagedUpload(root: string, url: string, jobId = 'manual-stage'): Promise<{ quarantinePath: string; restore: () => Promise<void> }> {
  const source = resolveManagedUploadPath(root, url);
  const destination = quarantinePath(root, jobId);
  await assertUploadDirectories(root);
  if (await regularFileExists(destination, 'Quarantined upload')) throw new Error('Cleanup quarantine already exists');
  const sourceInfo = await lstat(source);
  assertRegularFile(sourceInfo, 'Managed upload');
  await mkdir(path.dirname(destination), { recursive: true });
  await assertRealDirectory(path.dirname(destination), 'Cleanup quarantine directory');
  await rename(source, destination);
  return {
    quarantinePath: destination,
    restore: async (): Promise<void> => {
      await assertUploadDirectories(root);
      await assertQuarantineDirectory(root, true);
      try {
        assertRegularFile(await lstat(destination), 'Quarantined upload');
      } catch (error) {
        if (isEnoent(error)) return;
        throw error;
      }
      if (await regularFileExists(source, 'Managed upload')) throw new Error('Managed upload already exists; refusing restore overwrite');
      await rename(destination, source);
    },
  };
}

export function isRetentionCandidate(asset: { url: string; createdAt: Date | null }, now: Date): boolean {
  if (!asset.createdAt || !isManagedUploadUrl(asset.url)) return false;
  return asset.createdAt.getTime() <= now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

function parseImageList(value: string | null): Array<Record<string, unknown>> {
  try {
    const images: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(images)) throw new Error('not an array');
    return images.filter((image): image is Record<string, unknown> => typeof image === 'object' && image !== null);
  } catch {
    throw new Error('Malformed image_list JSON; refusing file deletion');
  }
}

function imageListReferences(value: string | null, url: string): boolean {
  return parseImageList(value).some((image) => image.url === url);
}

function removeImageUrl(value: string | null, url: string): string | null {
  const images = parseImageList(value);
  const filtered = images.filter((image) => image.url !== url);
  return filtered.length === images.length ? null : JSON.stringify(filtered);
}

function fieldReferences<T extends Record<string, unknown>>(rows: T[], fields: string[], table: string, url: string): FileReference[] {
  return rows.flatMap((row) => fields.filter((field) => row[field] === url).map((field) => ({ kind: table + '.' + field, recordId: String(row.id) })));
}

export async function findFileReferences(url: string): Promise<FileReference[]> {
  const [activities, submissions, requests, slips, originals, attendance] = await Promise.all([
    query<Record<string, unknown>>('SELECT id,plan_file_url,record_file_url,record_photo_url,scoring_table_url FROM activities WHERE plan_file_url=$1 OR record_file_url=$1 OR record_photo_url=$1 OR scoring_table_url=$1', [url]),
    query<Record<string, unknown>>('SELECT id,plan_file_url,record_file_url FROM activity_submissions WHERE plan_file_url=$1 OR record_file_url=$1', [url]),
    query<Record<string, unknown>>('SELECT id,leave_image_url FROM leave_requests WHERE leave_image_url=$1', [url]),
    query<{ id: string; leave_image_url: string | null; image_list: string | null }>('SELECT id,leave_image_url,image_list FROM leave_slips WHERE leave_image_url=$1 OR image_list LIKE $2', [url, '%' + url + '%']),
    query<{ id: string; image_url: string | null; image_list: string | null }>('SELECT id,image_url,image_list FROM original_leave_slips WHERE image_url=$1 OR image_list LIKE $2', [url, '%' + url + '%']),
    query<ImageRow>('SELECT id,image_list FROM attendance_work_arrangements WHERE image_list LIKE $1', ['%' + url + '%']),
  ]);
  return [
    ...fieldReferences(activities, ['plan_file_url', 'record_file_url', 'record_photo_url', 'scoring_table_url'], 'activities', url),
    ...fieldReferences(submissions, ['plan_file_url', 'record_file_url'], 'activity_submissions', url),
    ...fieldReferences(requests, ['leave_image_url'], 'leave_requests', url),
    ...fieldReferences(slips, ['leave_image_url'], 'leave_slips', url),
    ...fieldReferences(originals, ['image_url'], 'original_leave_slips', url),
    ...slips.filter((row) => imageListReferences(row.image_list, url)).map((row) => ({ kind: 'leave_slips.image_list', recordId: row.id })),
    ...originals.filter((row) => imageListReferences(row.image_list, url)).map((row) => ({ kind: 'original_leave_slips.image_list', recordId: row.id })),
    ...attendance.filter((row) => imageListReferences(row.image_list, url)).map((row) => ({ kind: 'attendance_work_arrangements.image_list', recordId: row.id })),
  ];
}

async function clearColumn(client: DatabaseClient, table: string, column: string, url: string): Promise<number> {
  const result = await client.query<{ id: string }>('UPDATE ' + table + ' SET ' + column + '=NULL WHERE ' + column + '=$1 RETURNING id', [url]);
  return result.rows.length;
}

async function clearImageList(client: DatabaseClient, table: 'leave_slips' | 'original_leave_slips' | 'attendance_work_arrangements', url: string): Promise<number> {
  const rows = await client.query<ImageRow>('SELECT id,image_list FROM ' + table + ' WHERE image_list LIKE $1', ['%' + url + '%']);
  let detached = 0;
  for (const row of rows.rows) {
    const next = removeImageUrl(row.image_list, url);
    if (!next) continue;
    await client.query('UPDATE ' + table + ' SET image_list=$1 WHERE id=$2', [next, row.id]);
    detached += 1;
  }
  return detached;
}

async function detachFileReferencesInTransaction(client: DatabaseClient, url: string): Promise<number> {
  const counts = await Promise.all([
      clearColumn(client, 'activities', 'plan_file_url', url), clearColumn(client, 'activities', 'record_file_url', url),
      clearColumn(client, 'activities', 'record_photo_url', url), clearColumn(client, 'activities', 'scoring_table_url', url),
      clearColumn(client, 'activity_submissions', 'plan_file_url', url), clearColumn(client, 'activity_submissions', 'record_file_url', url),
      clearColumn(client, 'leave_requests', 'leave_image_url', url), clearColumn(client, 'leave_slips', 'leave_image_url', url),
      clearColumn(client, 'original_leave_slips', 'image_url', url), clearImageList(client, 'leave_slips', url),
      clearImageList(client, 'original_leave_slips', url), clearImageList(client, 'attendance_work_arrangements', url),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

export async function detachFileReferences(url: string): Promise<{ detached: number }> {
  return { detached: await withTransaction((client) => detachFileReferencesInTransaction(client, url)) };
}

function isPendingDatabaseStatus(status: string): status is PendingDatabaseStatus {
  return status === 'pending_database_manual_confirmed' || status === 'pending_database_automatic';
}

function isPhysicalCleanupStatus(status: string): boolean {
  return status === 'pending_physical_cleanup' || status === 'physical_cleanup_failed';
}

async function registerCleanupJob(url: string, status: PendingDatabaseStatus): Promise<RegisteredJob> {
  return withTransaction(async (client) => {
    const inserted = await client.query<JobRow>('INSERT INTO file_cleanup_jobs (asset_url,status) VALUES ($1,$2) ON CONFLICT (asset_url) DO NOTHING RETURNING id,asset_url,status,staged_path', [url, status]);
    if (inserted.rows[0]) return { job: inserted.rows[0], created: true };
    const jobs = await client.query<JobRow>('SELECT id,asset_url,status,staged_path FROM file_cleanup_jobs WHERE asset_url=$1', [url]);
    if (!jobs.rows[0]) throw new Error('Could not register cleanup job');
    return { job: jobs.rows[0], created: false };
  });
}

async function markJob(jobId: string, status: string, errorCode: string, stagedPath: string | null): Promise<void> {
  await query('UPDATE file_cleanup_jobs SET status=$1,staged_path=$2,attempts=attempts+1,last_error=$3,updated_at=NOW() WHERE id=$4', [status, stagedPath, errorCode, jobId]);
}

async function deleteQuarantinedFile(root: string, jobId: string): Promise<void> {
  await assertUploadDirectories(root);
  if (!(await assertQuarantineDirectory(root, false))) return;
  const staged = quarantinePath(root, jobId);
  try {
    assertRegularFile(await lstat(staged), 'Quarantined upload');
  } catch (error) {
    if (isEnoent(error)) return;
    throw error;
  }
  try {
    await unlink(staged);
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
}

async function finalizeCleanupJob(root: string, jobId: string, url: string, actor: Pick<AuthUser, 'id'> | null | undefined, automatic: boolean): Promise<string | null> {
  try {
    return await withTransaction(async (client) => {
      const jobs = await client.query<JobRow>('SELECT id,asset_url,status,staged_path FROM file_cleanup_jobs WHERE id=$1 FOR UPDATE', [jobId]);
      const job = jobs.rows[0];
      if (!job) return null;
      if (!isPhysicalCleanupStatus(job.status)) throw new Error('Cleanup job is not ready for physical deletion');
      await assertUploadDirectories(root);
      await assertQuarantineDirectory(root, false);
      const stagedPath = quarantinePath(root, job.id);
      const stagedExists = await regularFileExists(stagedPath, 'Quarantined upload');
      const originalExists = await regularFileExists(resolveManagedUploadPath(root, url), 'Managed upload');
      if (originalExists) throw new Error('Managed upload exists; refusing physical cleanup');
      await deleteQuarantinedFile(root, job.id);
      await writeAuditLog({ actor, action: 'delete_file_completed', resourceType: 'file', resourceId: url, details: { automatic, physicalCleanup: stagedExists ? 'completed' : 'already_absent' } }, client);
      await client.query('DELETE FROM file_cleanup_jobs WHERE id=$1', [job.id]);
      return job.id;
    });
  } catch (error) {
    await markJob(jobId, 'physical_cleanup_failed', 'PHYSICAL_CLEANUP_FAILED', quarantinePath(root, jobId));
    await writeAuditLog({ actor, action: 'delete_file_physical_cleanup_failed', resourceType: 'file', resourceId: url, details: { automatic, physicalCleanup: 'failed', error: 'PHYSICAL_CLEANUP_FAILED' } });
    throw new Error('PHYSICAL_CLEANUP_FAILED');
  }
}

export type FileDeletionResult = { ok: boolean; status: 'deleted' | 'not_found' | 'referenced' | 'pending'; references?: FileReference[]; error?: string };

export async function deleteManagedFile(url: string, options: { detachReferences: boolean; confirmed?: boolean; automatic?: boolean; root?: string; actor?: Pick<AuthUser, 'id'> | null; now?: Date } ): Promise<FileDeletionResult> {
  if (!isManagedUploadUrl(url)) return { ok: false, status: 'not_found' };
  const root = options.root || process.cwd();
  const staged = { value: null as Awaited<ReturnType<typeof stageManagedUpload>> | null };
  let dbCommitted = false;
  let transactionResult: { kind: 'not_found' } | { kind: 'referenced'; references: FileReference[] } | { kind: 'pending'; job: JobRow } | { kind: 'waiting'; job: JobRow };
  try {
    const existingAsset = await queryOne<AssetRow>('SELECT url,uploaded_by_user_id,purpose,created_at FROM upload_assets WHERE url=$1', [url]);
    const existingJob = await queryOne<JobRow>('SELECT id,asset_url,status,staged_path FROM file_cleanup_jobs WHERE asset_url=$1', [url]);
    if (!existingAsset && !existingJob) return { ok: false, status: 'not_found' };
    if (existingJob && !isPendingDatabaseStatus(existingJob.status) && !isPhysicalCleanupStatus(existingJob.status)) return { ok: false, status: 'pending', error: 'DATABASE_CLEANUP_FAILED' };
    if (existingJob && isPhysicalCleanupStatus(existingJob.status) && !existingAsset) {
      try {
        await finalizeCleanupJob(root, existingJob.id, url, options.actor, Boolean(options.automatic));
        return { ok: true, status: 'deleted' };
      } catch {
        return { ok: false, status: 'pending', error: 'PHYSICAL_CLEANUP_FAILED' };
      }
    }
    const automatic = existingJob ? existingJob.status === 'pending_database_automatic' : Boolean(options.automatic);
    if (existingAsset && automatic && !isRetentionCandidate({ url: existingAsset.url, createdAt: existingAsset.created_at }, options.now || new Date())) return { ok: false, status: 'not_found' };
    const preflightReferences = existingAsset ? await findFileReferences(url) : [];
    if (preflightReferences.length && (!options.detachReferences || (!automatic && !options.confirmed && !existingJob))) return { ok: false, status: 'referenced', references: preflightReferences };
    const registration = existingJob ? { job: existingJob, created: false } : await registerCleanupJob(url, automatic ? 'pending_database_automatic' : 'pending_database_manual_confirmed');
    transactionResult = await withTransaction(async (client) => {
      const lockedAssets = await client.query<AssetRow>('SELECT url,uploaded_by_user_id,purpose,created_at FROM upload_assets WHERE url=$1 FOR UPDATE', [url]);
      const asset = lockedAssets.rows[0] || null;
      const jobs = await client.query<JobRow>('SELECT id,asset_url,status,staged_path FROM file_cleanup_jobs WHERE asset_url=$1 FOR UPDATE', [url]);
      const lockedJob = jobs.rows[0] || registration.job;
      if (!asset) return { kind: 'waiting' as const, job: lockedJob };
      if (!isPendingDatabaseStatus(lockedJob.status)) return { kind: 'waiting' as const, job: lockedJob };
      const lockedAutomatic = lockedJob.status === 'pending_database_automatic';
      if (lockedAutomatic && !isRetentionCandidate({ url: asset.url, createdAt: asset.created_at }, options.now || new Date())) {
        if (registration.created) await client.query('DELETE FROM file_cleanup_jobs WHERE id=$1 AND status=$2', [lockedJob.id, lockedJob.status]);
        return { kind: 'not_found' as const };
      }

      const references = await findFileReferences(url);
      if (references.length && !options.detachReferences) {
        if (registration.created) await client.query('DELETE FROM file_cleanup_jobs WHERE id=$1 AND status=$2', [lockedJob.id, lockedJob.status]);
        return { kind: 'referenced' as const, references };
      }
      const job = lockedJob;
      const stagedPath = quarantinePath(root, job.id);
      if (!(await regularFileExists(stagedPath, 'Quarantined upload')) && await regularFileExists(resolveManagedUploadPath(root, url), 'Managed upload')) staged.value = await stageManagedUpload(root, url, job.id);
      if (options.detachReferences) await detachFileReferencesInTransaction(client, url);
      await writeAuditLog({ actor: options.actor, action: 'delete_file_pending_physical_cleanup', resourceType: 'file', resourceId: url, details: { detachedReferences: options.detachReferences, automatic: lockedAutomatic, physicalCleanup: 'pending' } }, client);
      await client.query('DELETE FROM upload_assets WHERE url=$1', [url]);
      await client.query("UPDATE file_cleanup_jobs SET status='pending_physical_cleanup',staged_path=$1,last_error=NULL,updated_at=NOW() WHERE id=$2", [staged.value?.quarantinePath || stagedPath, job.id]);
      return { kind: 'pending' as const, job };
    });
    dbCommitted = true;
  } catch {
    if (staged.value && !dbCommitted) {
      try {
        await staged.value.restore();
      } catch {
        return { ok: false, status: 'pending', error: 'RESTORE_FAILED' };
      }
    }
    return { ok: false, status: 'pending', error: 'DATABASE_CLEANUP_FAILED' };
  }
  if (transactionResult.kind === 'not_found') return { ok: false, status: 'not_found' };
  if (transactionResult.kind === 'referenced') return { ok: false, status: 'referenced', references: transactionResult.references };
  if (transactionResult.kind === 'waiting') return { ok: false, status: 'pending', error: 'DATABASE_CLEANUP_FAILED' };
  try {
    await finalizeCleanupJob(root, transactionResult.job.id, url, options.actor, transactionResult.job.status === 'pending_database_automatic');
    return { ok: true, status: 'deleted' };
  } catch {
    return { ok: false, status: 'pending', error: 'PHYSICAL_CLEANUP_FAILED' };
  }
}

async function retryFileCleanupJobs(root: string, limit: number, now: Date): Promise<{ deleted: number; pending: number }> {
  const jobs = await query<JobRow>("SELECT id,asset_url,status,staged_path FROM file_cleanup_jobs WHERE status IN ('pending_database_manual_confirmed','pending_database_automatic','pending_physical_cleanup','physical_cleanup_failed') ORDER BY updated_at ASC LIMIT $1", [limit]);
  let deleted = 0;
  let pending = 0;
  for (const job of jobs) {
    const result = await deleteManagedFile(job.asset_url, { detachReferences: true, confirmed: job.status === 'pending_database_manual_confirmed', automatic: job.status === 'pending_database_automatic', root, now });
    if (result.status === 'deleted') deleted += 1;
    else pending += 1;
  }
  return { deleted, pending };
}

export async function runFileRetention(options: { now?: Date; limit?: number; root?: string } = {}): Promise<{ deleted: number; pending: number; skipped: number }> {
  const now = options.now || new Date();
  const limit = Math.max(1, Math.min(options.limit || 100, 500));
  const root = options.root || process.cwd();
  const retries = await retryFileCleanupJobs(root, limit, now);
  const assets = await query<AssetRow>('SELECT url,uploaded_by_user_id,purpose,created_at FROM upload_assets WHERE url LIKE $1 ORDER BY created_at ASC NULLS LAST LIMIT $2', ['/uploads/%', limit]);
  let deleted = retries.deleted;
  let pending = retries.pending;
  let skipped = 0;
  for (const asset of assets) {
    if (!isRetentionCandidate({ url: asset.url, createdAt: asset.created_at }, now)) { skipped += 1; continue; }
    const result = await deleteManagedFile(asset.url, { detachReferences: true, automatic: true, root, now });
    if (result.status === 'deleted') deleted += 1;
    else if (result.status === 'pending') pending += 1;
    else skipped += 1;
  }
  return { deleted, pending, skipped };
}

export async function listManagedFiles(page: number, pageSize: number, now = new Date()): Promise<{ total: number; items: Array<{ id: string; url: string; purpose: string; createdAt: Date | null; uploadedByUserId: string | null; references: FileReference[]; retentionStatus: 'active' | 'due' }>; pendingJobs: Array<{ id: string; jobId: string; url: string; status: string }> }> {
  const offset = (page - 1) * pageSize;
  const [totalRow, assets, jobs] = await Promise.all([
    queryOne<{ count: string }>('SELECT COUNT(*) AS count FROM upload_assets', []),
    query<AssetRow>('SELECT url,uploaded_by_user_id,purpose,created_at FROM upload_assets ORDER BY created_at DESC NULLS LAST,url LIMIT $1 OFFSET $2', [pageSize, offset]),
    query<JobRow>("SELECT id,asset_url,status,staged_path FROM file_cleanup_jobs WHERE status IN ('pending_database_manual_confirmed','pending_database_automatic','pending_physical_cleanup','physical_cleanup_failed','pending_database') ORDER BY updated_at ASC", []),
  ]);
  const items = await Promise.all(assets.map(async (asset) => ({
    id: encodeURIComponent(asset.url), url: asset.url, purpose: asset.purpose, createdAt: asset.created_at,
    uploadedByUserId: asset.uploaded_by_user_id, references: await findFileReferences(asset.url),
    retentionStatus: isRetentionCandidate({ url: asset.url, createdAt: asset.created_at }, now) ? 'due' as const : 'active' as const,
  })));
  return { total: Number(totalRow?.count || 0), items, pendingJobs: jobs.map((job) => ({ id: job.id, jobId: job.id, url: job.asset_url, status: job.status })) };
}
