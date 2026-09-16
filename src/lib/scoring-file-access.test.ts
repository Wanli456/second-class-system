import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET as download } from '@/app/api/uploads/[filename]/route';
import { POST } from '@/app/api/scoring/import/route';
import { createSessionToken } from './auth';
import { ensureDatabaseSchema, query } from '@/storage/database/supabase-client';

async function run() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  await ensureDatabaseSchema();
  for (const [id, score, submit] of [['source-owner', false, true], ['source-scorer', true, false], ['source-outsider', false, true]] as const) {
    await query("INSERT INTO users (id,username,password,student_id,role,can_score,can_import_scoring) VALUES ($1,$1,'test',$1,'student',$2,$3)", [id, score, submit]);
  }
  await query("INSERT INTO upload_assets (url, original_file_name, uploaded_by_user_id, purpose) VALUES ('/uploads/source-access.xlsx','班级表.xlsx','source-owner','scoring')");
  await query("INSERT INTO scoring_imports (id,file_url,submitted_by_id,status,total_rows,valid_rows) VALUES ('source-access','/uploads/source-access.xlsx','source-owner','待人工确认',1,1)");
  await query("INSERT INTO users (id,username,password,student_id,role,admin_session_id) VALUES ('source-admin','audit-admin','test','source-admin','admin','audit-session')");
  const originalCwd = process.cwd();
  const debugRoot = path.join(originalCwd, 'cn_debug');
  await mkdir(debugRoot, { recursive: true });
  const fixtureRoot = await mkdtemp(path.join(debugRoot, 'scoring-file-test-'));
  try {
    await mkdir(path.join(fixtureRoot, 'public', 'uploads'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'public', 'uploads', 'source-access.xlsx'), 'source-file-bytes');
    process.chdir(fixtureRoot);
    for (const [id, status] of [['source-owner', 200], ['source-scorer', 200], ['source-admin', 200], ['source-outsider', 403], ['', 401]] as const) {
      const headers = id ? { Authorization: `Bearer ${createSessionToken(id, id === 'source-admin' ? 'audit-session' : undefined)}` } : undefined;
      const response = await download(new NextRequest('http://localhost/api/uploads/source-access.xlsx', { headers }), { params: Promise.resolve({ filename: 'source-access.xlsx' }) });
      assert.equal(response.status, status, `${id || 'anonymous'} file access`);
      if (status === 200) {
        assert.equal(await response.text(), 'source-file-bytes');
        assert.ok(decodeURIComponent(response.headers.get('Content-Disposition') || '').includes('班级表.xlsx'));
      }
    }
    const response = await POST(new NextRequest('http://localhost/api/scoring/import', { method: 'POST', headers: { Authorization: `Bearer ${createSessionToken('source-outsider')}`, 'content-type': 'application/json' }, body: JSON.stringify({ fileUrl: '/uploads/source-access.xlsx', rows: [{ studentId: 'abc' }] }) }));
    assert.equal(response.status, 403, 'Cannot attach another user upload to acquire download access');
    const ownSubmission = await POST(new NextRequest('http://localhost/api/scoring/import', { method: 'POST', headers: { Authorization: `Bearer ${createSessionToken('source-owner')}`, 'content-type': 'application/json' }, body: JSON.stringify({ fileUrl: '/uploads/source-access.xlsx', rows: [{ studentId: 'abc' }] }) }));
    assert.equal(ownSubmission.status, 200, 'Own upload remains submittable even when row validation rejects the content');
  } finally {
    process.chdir(originalCwd);
    assert.equal(path.dirname(fixtureRoot), debugRoot);
    assert.ok(path.basename(fixtureRoot).startsWith('scoring-file-test-'));
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
