import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { PUT as updateActivity } from '@/app/api/activities/route';
import { issueSessionToken } from '@/lib/auth';
import { ensureDatabaseSchema, query } from '@/storage/database/supabase-client';

async function run(): Promise<void> {
  const routeSource = readFileSync(path.join(process.cwd(), 'src/app/api/activities/route.ts'), 'utf8');
  assert.match(routeSource, /const data = await withTransaction\(async \(client\) => \{[\s\S]*?action: isScoringMaterialSubmission[\s\S]*?\}, client\)/, '活动更新必须把审计写入传入同一事务 client');

  await ensureDatabaseSchema();
  await query('DELETE FROM audit_logs');
  await query('DELETE FROM activities WHERE id=$1', ['audit-atomic-activity']);
  await query(
    `INSERT INTO activities (id, full_name, start_time, end_time, registration_start_time, registration_end_time, category, category_primary, category_secondary, level, leader_name, leader_phone, scope_type, scope_name, status, scoring_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'正常活动','待赋分')`,
    ['audit-atomic-activity', '审计原子性旧名称', '2026-09-20 10:00:00', '2026-09-20 12:00:00', '2026-09-10 10:00:00', '2026-09-19 12:00:00', '德', '思想政治', '主题学习', '院系级', '负责人', '9000000005', 'department', '学生会'],
  );
  await query("ALTER TABLE audit_logs ADD CONSTRAINT audit_log_blocks_activity_update CHECK (action <> 'update_activity')");

  const response = await updateActivity(new NextRequest('http://localhost/api/activities', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await issueSessionToken('local-admin')}` },
    body: JSON.stringify({ id: 'audit-atomic-activity', full_name: '审计原子性新名称' }),
  }));
  assert.equal(response.status, 500, JSON.stringify(await response.json()));
}

run().then(() => console.log('audit route transaction failure-path test passed (pg-mem cannot verify PostgreSQL rollback)')).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
