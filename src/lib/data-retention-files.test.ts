import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET as listFiles } from '@/app/api/admin/files/route';
import { DELETE } from '@/app/api/admin/files/[id]/route';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';
import {
  assertRegularFile,
  deleteManagedFile,
  findFileReferences,
  isRetentionCandidate,
  resolveManagedUploadPath,
  runFileRetention,
  stageManagedUpload,
} from './data-retention-files';
import { issueSessionToken } from './auth';

async function run(): Promise<void> {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  assert.equal(isRetentionCandidate({ url: '/uploads/old.png', createdAt: new Date('2026-03-08T00:00:00.000Z') }, new Date('2026-09-05T00:00:00.000Z')), true);
  assert.equal(isRetentionCandidate({ url: '/uploads/unknown.png', createdAt: null }, new Date('2026-09-05T00:00:00.000Z')), false, 'unknown dates are never candidates');
  assert.equal(isRetentionCandidate({ url: '/other/old.png', createdAt: new Date('2026-01-01T00:00:00.000Z') }, new Date('2026-09-05T00:00:00.000Z')), false, 'unmanaged paths are never candidates');

  const root = await mkdtemp(path.join(os.tmpdir(), 'second-class-retention-test-'));
  const previous = process.cwd();
  try {
    await mkdir(path.join(root, 'public', 'uploads'), { recursive: true });
    await writeFile(path.join(root, 'public', 'uploads', 'old.png'), 'original');
    assert.equal(resolveManagedUploadPath(root, '/uploads/old.png'), path.join(root, 'public', 'uploads', 'old.png'));
    assert.throws(() => resolveManagedUploadPath(root, '/uploads/../escape.png'));
    assert.throws(() => resolveManagedUploadPath(root, '/uploads/nested/escape.png'));
    assert.throws(() => assertRegularFile({ isFile: () => false, isSymbolicLink: () => true }, 'Managed upload'), /symbolic link/i);

    const staged = await stageManagedUpload(root, '/uploads/old.png');
    assert.equal((await lstat(staged.quarantinePath)).isFile(), true);
    assert.equal(await readFile(staged.quarantinePath, 'utf8'), 'original');
    assert.equal(await lstat(path.join(root, 'public', 'uploads', 'old.png')).then(() => true).catch(() => false), false);
    await staged.restore();
    assert.equal(await readFile(path.join(root, 'public', 'uploads', 'old.png'), 'utf8'), 'original', 'failed DB work can restore a staged file');

    await ensureDatabaseSchema();
    process.chdir(root);
    const recentUrl = '/uploads/recent.png';
    await writeFile(path.join(root, 'public', 'uploads', 'recent.png'), 'recent');
    await query('INSERT INTO upload_assets (url,uploaded_by_user_id,purpose,created_at) VALUES ($1,$2,$3,$4)', [recentUrl, 'local-leader', 'activity', new Date('2026-03-10T00:00:00.000Z')]);
    await query("INSERT INTO leave_requests (student_id,class_name,student_name,leave_type,leave_image_url) VALUES ('retention-recent','class','name','x',$1)", [recentUrl]);
    await runFileRetention({ root, now: new Date('2026-09-05T00:00:00.000Z') });
    assert.notEqual(await queryOne('SELECT url FROM upload_assets WHERE url=$1', [recentUrl]), null, 'the supplied now must keep a 179-day asset out of automatic cleanup');
    assert.equal((await findFileReferences(recentUrl)).length, 1);
    assert.equal(await queryOne('SELECT id FROM file_cleanup_jobs WHERE asset_url=$1', [recentUrl]), null, 'an ineligible automatic deletion must not leave a job');

    const url = '/uploads/old.png';
    await query('INSERT INTO upload_assets (url,uploaded_by_user_id,purpose,created_at) VALUES ($1,$2,$3,$4)', [url, 'local-leader', 'activity', new Date('2026-03-08T00:00:00.000Z')]);
    await query("INSERT INTO activities (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,plan_file_url,record_file_url,record_photo_url,scoring_table_url) VALUES ('retention-activity','fact',NOW(),NOW(),'x','x','leader','phone',$1,$1,$1,$1)", [url]);
    await query("INSERT INTO activity_submissions (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,plan_file_url,record_file_url) VALUES ('retention-submission','fact',NOW(),NOW(),'x','x','leader','phone',$1,$1)", [url]);
    await query("INSERT INTO leave_requests (student_id,class_name,student_name,leave_type,leave_image_url) VALUES ('retention-student','class','name','x',$1)", [url]);
    await query("INSERT INTO leave_slips (id,applicant_user_id,class_names,leave_image_url,image_list) VALUES ('retention-slip','local-leader','[]',$1,$2)", [url, JSON.stringify([{ url, name: 'old' }, { url: '/uploads/keep.png', name: 'keep' }])]);
    await query("INSERT INTO original_leave_slips (id,image_url,image_list) VALUES ('retention-original',$1,$2)", [url, JSON.stringify([{ url, name: 'old' }])]);
    await query("INSERT INTO attendance_work_arrangements (id,student_names,image_list) VALUES ('retention-attendance','[]',$1)", [JSON.stringify([{ url, name: 'old' }])]);

    const references = await findFileReferences(url);
    assert.deepEqual(references.map((reference) => reference.kind).sort(), ['activities.plan_file_url','activities.record_file_url','activities.record_photo_url','activities.scoring_table_url','activity_submissions.plan_file_url','activity_submissions.record_file_url','attendance_work_arrangements.image_list','leave_requests.leave_image_url','leave_slips.image_list','leave_slips.leave_image_url','original_leave_slips.image_list','original_leave_slips.image_url'].sort());

    const headers = { Authorization: 'Bearer ' + await issueSessionToken('local-admin') };
    const list = await listFiles(new NextRequest('http://localhost/api/admin/files?page=1&pageSize=10', { headers }));
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.success, true);
    assert.deepEqual(Object.keys(listBody.data).sort(), ['items', 'page', 'pageSize', 'pendingJobs', 'total']);
    assert.deepEqual(Object.keys(listBody.data.items[0]).sort(), ['createdAt', 'id', 'purpose', 'references', 'retentionStatus', 'uploadedByUserId', 'url']);
    assert.equal(listBody.data.items.find((item: { url: string }) => item.url === url)?.references.length, 12);

    const blocked = await DELETE(new NextRequest('http://localhost/api/admin/files/old.png', { method: 'DELETE', headers }), { params: Promise.resolve({ id: 'old.png' }) });
    assert.equal(blocked.status, 409, 'manual deletion must not detach business evidence implicitly');
    assert.equal(await queryOne('SELECT id FROM file_cleanup_jobs WHERE asset_url=$1', [url]), null, 'a rejected manual deletion must not leave a replayable job');

    const malformedUrl = '/uploads/malformed.png';
    await writeFile(path.join(root, 'public', 'uploads', 'malformed.png'), 'malformed');
    await query('INSERT INTO upload_assets (url,uploaded_by_user_id,purpose,created_at) VALUES ($1,$2,$3,$4)', [malformedUrl, 'local-leader', 'activity', new Date('2026-01-01T00:00:00.000Z')]);
    await query("INSERT INTO leave_slips (id,applicant_user_id,class_names,image_list) VALUES ('retention-malformed','local-leader','[]',$1)", [JSON.stringify([{ url: malformedUrl }]) + 'truncated']);
    const malformed = await deleteManagedFile(malformedUrl, { detachReferences: true, confirmed: true, root });
    assert.deepEqual(malformed, { ok: false, status: 'pending', error: 'DATABASE_CLEANUP_FAILED' });
    assert.notEqual(await queryOne('SELECT url FROM upload_assets WHERE url=$1', [malformedUrl]), null);
    assert.equal(await queryOne('SELECT id FROM file_cleanup_jobs WHERE asset_url=$1', [malformedUrl]), null, 'malformed JSON must not create a replayable job');

    const failedUrl = '/uploads/failed.png';
    const failedJob = await queryOne<{ id: string }>("INSERT INTO file_cleanup_jobs (asset_url,status) VALUES ($1,'pending_physical_cleanup') RETURNING id", [failedUrl]);
    assert.ok(failedJob);
    const failedQuarantinePath = path.join(root, '.data-retention-quarantine', failedJob.id);
    await mkdir(failedQuarantinePath, { recursive: true });
    const physicalFailure = await deleteManagedFile(failedUrl, { detachReferences: true, confirmed: true, root });
    assert.deepEqual(physicalFailure, { ok: false, status: 'pending', error: 'PHYSICAL_CLEANUP_FAILED' });
    assert.equal(await lstat(path.join(root, 'public', 'uploads', 'failed.png')).then(() => true).catch(() => false), false, 'physical cleanup failure must never restore into uploads after database commit');
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM file_cleanup_jobs WHERE id=$1', [failedJob.id]))?.status, 'physical_cleanup_failed');
    await rm(failedQuarantinePath, { recursive: true, force: true });
    await writeFile(failedQuarantinePath, 'retry');
    const retriedPhysicalFailure = await deleteManagedFile(failedUrl, { detachReferences: true, confirmed: true, root });
    assert.deepEqual(retriedPhysicalFailure, { ok: true, status: 'deleted' });
    assert.equal(await queryOne('SELECT id FROM file_cleanup_jobs WHERE id=$1', [failedJob.id]), null, 'physical retry must finish without an upload_assets row');

    const conflictUrl = '/uploads/conflict.png';
    const conflictJob = await queryOne<{ id: string }>("INSERT INTO file_cleanup_jobs (asset_url,status) VALUES ($1,'pending_physical_cleanup') RETURNING id", [conflictUrl]);
    assert.ok(conflictJob);
    const conflictQuarantinePath = path.join(root, '.data-retention-quarantine', conflictJob.id);
    await writeFile(path.join(root, 'public', 'uploads', 'conflict.png'), 'original');
    await writeFile(conflictQuarantinePath, 'staged');
    const conflict = await deleteManagedFile(conflictUrl, { detachReferences: true, confirmed: true, root });
    assert.deepEqual(conflict, { ok: false, status: 'pending', error: 'PHYSICAL_CLEANUP_FAILED' });
    assert.equal(await readFile(path.join(root, 'public', 'uploads', 'conflict.png'), 'utf8'), 'original', 'a recovery conflict must preserve the original upload');
    assert.equal(await readFile(conflictQuarantinePath, 'utf8'), 'staged', 'a recovery conflict must preserve the quarantined file');
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM file_cleanup_jobs WHERE id=$1', [conflictJob.id]))?.status, 'physical_cleanup_failed');

    const deleted = await DELETE(new NextRequest('http://localhost/api/admin/files/old.png?confirm=true&detachReferences=true', { method: 'DELETE', headers }), { params: Promise.resolve({ id: 'old.png' }) });
    assert.equal(deleted.status, 200);
    assert.equal((await findFileReferences(url)).length, 0);
    assert.equal((await queryOne<{ leave_image_url: string | null; image_list: string }>('SELECT leave_image_url,image_list FROM leave_slips WHERE id=$1', ['retention-slip']))?.leave_image_url, null);
    assert.deepEqual(JSON.parse((await queryOne<{ image_list: string }>('SELECT image_list FROM leave_slips WHERE id=$1', ['retention-slip']))?.image_list || '[]'), [{ url: '/uploads/keep.png', name: 'keep' }]);
    assert.equal(await queryOne('SELECT url FROM upload_assets WHERE url=$1', [url]), null);
    assert.equal(await lstat(path.join(root, 'public', 'uploads', 'old.png')).then(() => true).catch(() => false), false);
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
  console.log('file data retention tests passed');
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
