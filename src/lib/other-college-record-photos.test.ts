import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/other-college-registrations/route';
import { GET as download } from '@/app/api/uploads/[filename]/route';
import { createSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

type StoredPhotos = {
  record_photo_list: string;
  record_photo_url: string | null;
  record_photo_file_name: string | null;
};

function request(userId: string, body: Record<string, unknown>, key: string): NextRequest {
  return new NextRequest('http://localhost/api/other-college-registrations', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + createSessionToken(userId),
      'content-type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
}

function registrationBody(recordPhotos: unknown, id?: string): Record<string, unknown> {
  return {
    ...(id ? { id } : {}),
    fullName: '多张备案表测试活动',
    organizer: '智能制造学院',
    category: '德',
    startTime: '2026-09-20T09:00',
    endTime: '2026-09-20T11:00',
    leaderName: '',
    contactPhone: '',
    scoringTableUrl: '/uploads/other-college-score.xlsx',
    scoringTableFileName: '伪造赋分表名.xlsx',
    recordPhotos,
  };
}

async function createUser(id: string, role = 'student', canScore = false): Promise<void> {
  await query(
    "INSERT INTO users (id,username,password,student_id,role,can_register_other_college,can_score,admin_session_id) VALUES ($1,$1,'test',$1,$2,true,$3,$4)",
    [id, role, canScore, role === 'admin' ? id + '-session' : null],
  );
}

async function main(): Promise<void> {
  await ensureDatabaseSchema();
  await createUser('other-photo-owner');
  await createUser('other-photo-scorer', 'student', true);
  await createUser('other-photo-outsider');
  await createUser('other-photo-admin', 'admin');
  await query(
    "INSERT INTO upload_assets (url,original_file_name,uploaded_by_user_id,purpose) VALUES ($1,$2,$3,'other-college'),($4,$5,$3,'other-college'),($6,$7,$3,'other-college'),($8,$9,$10,'other-college')",
    [
      '/uploads/other-college-score.xlsx', '真实赋分表.xlsx', 'other-photo-owner',
      '/uploads/other-photo-1.png', '备案表第1页.png',
      '/uploads/other-photo-2.png', '备案表第2页.png',
      '/uploads/other-photo-foreign.png', '别人的备案表.png', 'other-photo-outsider',
    ],
  );

  const created = await POST(request('other-photo-owner', registrationBody([
    { url: '/uploads/other-photo-1.png', fileName: '伪造-1.png' },
    { url: '/uploads/other-photo-2.png', fileName: '伪造-2.png' },
  ]), 'other-photo-create'));
  const createdBody = await created.json() as { success?: boolean; data?: { id?: string } };
  assert.equal(created.status, 200, JSON.stringify(createdBody));
  const createdId = createdBody.data?.id;
  assert.ok(createdId);

  const stored = await queryOne<StoredPhotos>(
    'SELECT record_photo_list,record_photo_url,record_photo_file_name FROM activities WHERE id=$1',
    [createdId],
  );
  assert.deepEqual(JSON.parse(stored?.record_photo_list || '[]'), [
    { url: '/uploads/other-photo-1.png', fileName: '备案表第1页.png' },
    { url: '/uploads/other-photo-2.png', fileName: '备案表第2页.png' },
  ]);
  assert.equal(stored?.record_photo_url, '/uploads/other-photo-1.png');
  assert.equal(stored?.record_photo_file_name, '备案表第1页.png');

  const records = await GET(new NextRequest('http://localhost/api/other-college-registrations', {
    headers: { Authorization: 'Bearer ' + createSessionToken('other-photo-owner') },
  }));
  const recordsBody = await records.json() as { data?: Array<{ id: string; record_photo_list?: string }> };
  assert.equal(recordsBody.data?.find((item) => item.id === createdId)?.record_photo_list, stored?.record_photo_list);

  const foreign = await POST(request('other-photo-owner', registrationBody([
    { url: '/uploads/other-photo-foreign.png', fileName: '别人的备案表.png' },
  ]), 'other-photo-foreign'));
  assert.equal(foreign.status, 403, '不能关联他人上传的照片');

  const overLimit = await POST(request(
    'other-photo-owner',
    registrationBody(Array.from({ length: 11 }, (_, index) => ({
      url: '/uploads/other-photo-' + index + '.png', fileName: index + '.png',
    }))),
    'other-photo-over-limit',
  ));
  assert.equal(overLimit.status, 400, '最多保存十张备案表照片');

  await query(
    "INSERT INTO activities (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,scope_type,scope_name,scoring_material_submitter_id,scoring_table_url,scoring_table_file_name,record_photo_url,record_photo_file_name,status,scoring_status) VALUES ('other-photo-legacy','旧单图登记',NOW(),NOW()+INTERVAL '1 hour','德','校级','','','other_college','智能制造学院',$1,'/uploads/other-college-score.xlsx','真实赋分表.xlsx','/uploads/legacy-photo.png','旧备案表.png','正常活动','待赋分')",
    ['other-photo-owner'],
  );
  const legacy = await POST(request('other-photo-owner', registrationBody([
    { url: '/uploads/legacy-photo.png', fileName: '旧备案表.png' },
  ], 'other-photo-legacy'), 'other-photo-legacy-update'));
  assert.equal(legacy.status, 200, '旧单图可在重新提交时保留');

  const originalCwd = process.cwd();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'other-college-record-photos-'));
  try {
    await mkdir(path.join(tempRoot, 'public', 'uploads'), { recursive: true });
    await writeFile(path.join(tempRoot, 'public', 'uploads', 'other-photo-1.png'), Buffer.from('first'));
    await writeFile(path.join(tempRoot, 'public', 'uploads', 'other-photo-2.png'), Buffer.from('second'));
    process.chdir(tempRoot);
    for (const [userId, status] of [
      ['other-photo-owner', 200], ['other-photo-scorer', 200], ['other-photo-admin', 200], ['other-photo-outsider', 403],
    ] as const) {
      const token = userId === 'other-photo-admin'
        ? createSessionToken(userId, 'other-photo-admin-session')
        : createSessionToken(userId);
      const response = await download(new NextRequest('http://localhost/api/uploads/other-photo-2.png', {
        headers: { Authorization: 'Bearer ' + token },
      }), { params: Promise.resolve({ filename: 'other-photo-2.png' }) });
      assert.equal(response.status, status, userId + ' 下载第二张备案表照片');
      if (status === 200) assert.equal(await response.text(), 'second');
    }
  } finally {
    process.chdir(originalCwd);
    assert.equal(path.dirname(tempRoot), path.resolve(os.tmpdir()));
    assert.ok(path.basename(tempRoot).startsWith('other-college-record-photos-'));
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
