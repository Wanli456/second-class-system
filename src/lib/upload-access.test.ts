import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/uploads/[filename]/route';
import { createSessionToken } from './auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

async function run() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  await ensureDatabaseSchema();
  const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE student_id=$1', ['9000000006']);
  assert.ok(user);
  const root = await mkdtemp(path.join(os.tmpdir(), 'second-class-upload-test-'));
  const previous = process.cwd();
  try {
    await mkdir(path.join(root, 'public', 'uploads'), { recursive: true });
    for (const filename of ['first.png', 'second.png', 'third.png', 'unrelated.png', 'attendance-own.png', 'attendance-approved.png']) {
      await writeFile(path.join(root, 'public', 'uploads', filename), Buffer.from([137, 80, 78, 71]));
    }
    await query(`INSERT INTO leave_slips (id, applicant_user_id, leave_image_url, image_list, class_names)
      VALUES ($1,$2,$3,$4,'[]')`, ['multi-test', user.id, '/uploads/first.png', JSON.stringify([
      { url: '/uploads/first.png', name: 'first' }, { url: '/uploads/second.png', name: 'second' },
      { url: '/uploads/third.png', name: 'third' },
    ])]);
    await query(`INSERT INTO attendance_work_arrangements
      (id, created_by_user_id, image_list, review_status, student_names)
      VALUES ($1, $2, $3, '待查对', '[]'), ($4, $2, $5, '已通过', '[]')`, [
      'upload-access-attendance-pending', 'local-leader',
      JSON.stringify([{ url: '/uploads/attendance-own.png', name: 'attendance-own' }]),
      'upload-access-attendance-approved',
      JSON.stringify([{ url: '/uploads/attendance-approved.png', name: 'attendance-approved' }]),
    ]);
    process.chdir(root);
    const headers = { Authorization: `Bearer ${createSessionToken(user.id)}` };
    const anonymous = await GET(new NextRequest('http://localhost/api/uploads/second.png'),
      { params: Promise.resolve({ filename: 'second.png' }) });
    assert.equal(anonymous.status, 401);
    const otherUser = await GET(new NextRequest('http://localhost/api/uploads/second.png', {
      headers: { Authorization: `Bearer ${createSessionToken('local-leader')}` },
    }), { params: Promise.resolve({ filename: 'second.png' }) });
    assert.equal(otherUser.status, 403, 'An unrelated applicant must not read another user multi-image attachment');
    for (const filename of ['first.png', 'second.png', 'third.png']) {
      const response = await GET(new NextRequest(`http://localhost/api/uploads/${filename}`, { headers }),
        { params: Promise.resolve({ filename }) });
      assert.equal(response.status, 200, `${filename} must be available to its applicant`);
      assert.equal((await response.arrayBuffer()).byteLength, 4);
    }
    const denied = await GET(new NextRequest('http://localhost/api/uploads/unrelated.png', { headers }),
      { params: Promise.resolve({ filename: 'unrelated.png' }) });
    assert.equal(denied.status, 403, 'Unreferenced files must remain private');

    const leaderHeaders = { Authorization: `Bearer ${createSessionToken('local-leader')}` };
    const ownAttendance = await GET(new NextRequest('http://localhost/api/uploads/attendance-own.png', { headers: leaderHeaders }),
      { params: Promise.resolve({ filename: 'attendance-own.png' }) });
    assert.equal(ownAttendance.status, 200, 'The arrangement submitter must read their own attachment');

    const reviewerHeaders = { Authorization: `Bearer ${createSessionToken('local-sports-leader')}` };
    const approvedAttendance = await GET(new NextRequest('http://localhost/api/uploads/attendance-approved.png', { headers: reviewerHeaders }),
      { params: Promise.resolve({ filename: 'attendance-approved.png' }) });
    assert.equal(approvedAttendance.status, 200, 'Attendance reviewers must read arrangement attachments');

    const unrelatedAttendance = await GET(new NextRequest('http://localhost/api/uploads/attendance-own.png', { headers }),
      { params: Promise.resolve({ filename: 'attendance-own.png' }) });
    assert.equal(unrelatedAttendance.status, 403, 'Unrelated users must not read arrangement attachments');
  } finally {
    process.chdir(previous);
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('second-class-upload-test-'));
    await rm(root, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
