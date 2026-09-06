import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as exportData } from '@/app/api/admin/export/route';
import { GET as listAuditLogs } from '@/app/api/admin/audit-logs/route';
import { issueSessionToken } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit-log';
import { ensureDatabaseSchema, query } from '@/storage/database/supabase-client';

async function run(): Promise<void> {
  await ensureDatabaseSchema();
  const adminHeaders = { Authorization: `Bearer ${await issueSessionToken('local-admin')}` };
  await query('DELETE FROM audit_logs');
  await query('INSERT INTO departments (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', ['audit-export-formula', '=SUM(1,1)']);
  await query('INSERT INTO departments (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', ['audit-export-tab', '\t=1+1\r']);
  await query('INSERT INTO departments (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', ['audit-export-control', '\u0001=1+1\r']);

  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  await writeAuditLog({
    actor: { id: 'local-admin', username: '本地管理员' } as never,
    action: 'test_audit',
    resourceType: 'test',
    details: { status: 'ok', password: 'must-not-store', attachmentUrl: '/uploads/private.png', name: '不应保留', student_id: '9000000001', phone: '13800000000', ipAddress: '127.0.0.1' },
  }, {
    query: async <T>(sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [] as T[] };
    },
  });
  assert.equal(calls.length, 1, 'writeAuditLog must use the supplied transaction client');
  const sanitizedDetails = JSON.parse(String(calls[0].params?.[5] || '{}'));
  assert.deepEqual(sanitizedDetails, { status: 'ok' }, 'audit details must exclude secrets and attachment URLs');

  assert.equal((await listAuditLogs(new NextRequest('http://localhost/api/admin/audit-logs'))).status, 401);
  assert.equal((await listAuditLogs(new NextRequest('http://localhost/api/admin/audit-logs', {
    headers: { Authorization: `Bearer ${await issueSessionToken('local-leader')}` },
  }))).status, 403);

  const jsonResponse = await exportData(new NextRequest('http://localhost/api/admin/export?table=departments&format=json&limit=1', { headers: adminHeaders }));
  assert.equal(jsonResponse.status, 200);
  const json = await jsonResponse.json();
  assert.deepEqual(Object.keys(json).sort(), ['data', 'meta', 'success']);
  assert.deepEqual(Object.keys(json.meta).sort(), ['format', 'limit', 'maxLimit', 'rowCount', 'table']);
  assert.deepEqual(Object.keys(json.data[0]).sort(), ['createdAt', 'id', 'name']);
  assert.equal(jsonResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal((await exportData(new NextRequest('http://localhost/api/admin/export?table=toString&format=json', { headers: adminHeaders }))).status, 400, 'inherited object properties are not export tables');
  assert.equal((await exportData(new NextRequest('http://localhost/api/admin/export?table=__proto__&format=json', { headers: adminHeaders }))).status, 400, 'prototype access is not an export table');

  const csvResponse = await exportData(new NextRequest('http://localhost/api/admin/export?table=departments&format=csv&limit=100', { headers: adminHeaders }));
  assert.equal(csvResponse.status, 200);
  const csv = await csvResponse.text();
  assert.equal(csvResponse.headers.get('Cache-Control'), 'no-store');
  assert.match(csv, /'=SUM\(1,1\)/, 'CSV formula-like cells must be escaped as text');
  assert.match(csv, /"'\t=1\+1\r"/, 'CSV must quote a tab-prefixed formula containing carriage return');
  assert.match(csv, /"'\u0001=1\+1\r"/, 'CSV must quote a control-prefixed formula containing carriage return');
  assert.doesNotMatch(csv, /password|token|secret|upload/i);

  const logsResponse = await listAuditLogs(new NextRequest('http://localhost/api/admin/audit-logs?page=1&pageSize=1&action=export_data', { headers: adminHeaders }));
  assert.equal(logsResponse.status, 200);
  assert.equal(logsResponse.headers.get('Cache-Control'), 'no-store');
  const logs = await logsResponse.json();
  assert.equal(logs.data.page, 1);
  assert.equal(logs.data.pageSize, 1);
  assert.ok(logs.data.total >= 2, 'each export must be audited');
  assert.deepEqual(Object.keys(logs.data.items[0]).sort(), ['action', 'actorUserId', 'createdAt', 'details', 'id', 'resourceId', 'resourceType']);
  assert.equal('actorName' in logs.data.items[0], false);
  assert.equal('ipAddress' in logs.data.items[0], false);
}

run().then(() => console.log('audit log and admin export tests passed')).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
