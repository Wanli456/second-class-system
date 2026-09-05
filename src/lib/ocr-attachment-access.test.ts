import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ocr/analyze/route';
import { ensureDatabaseSchema, query } from '@/storage/database/supabase-client';
import { canAccessOcrAttachment } from './ocr-attachment-access';
import { createSessionToken } from './auth';

async function run() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  await ensureDatabaseSchema();

  const ownUpload = '/uploads/ocr-own.png';
  const otherUpload = '/uploads/ocr-other.png';
  const ownLeave = '/uploads/ocr-own-leave.png';
  await query('INSERT INTO upload_assets (url, uploaded_by_user_id, purpose) VALUES ($1,$2,$3)', [ownUpload, 'local-student', 'leave']);
  await query('INSERT INTO upload_assets (url, uploaded_by_user_id, purpose) VALUES ($1,$2,$3)', [otherUpload, 'local-leader', 'leave']);
  await query(`INSERT INTO leave_slips (id, applicant_user_id, leave_image_url, image_list, class_names)
    VALUES ($1,$2,$3,$4,'[]')`, ['ocr-own-slip', 'local-student', ownLeave, JSON.stringify([{ url: ownLeave, name: 'leave.png' }])]);

  assert.equal(await canAccessOcrAttachment(ownUpload, 'local-student'), true);
  assert.equal(await canAccessOcrAttachment(otherUpload, 'local-student'), false);
  assert.equal(await canAccessOcrAttachment(ownLeave, 'local-student'), true);
  assert.equal(await canAccessOcrAttachment('/uploads/ocr-missing.png', 'local-student'), false);

  const response = await POST(new NextRequest('http://localhost/api/ocr/analyze', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${createSessionToken('local-leader')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrls: [ownUpload] }),
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { success: false, error: '无权识别该附件' });
  console.log('ocr attachment access tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
