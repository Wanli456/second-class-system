import { mkdir, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';

const connectionString = process.env.PGDATABASE_URL?.trim();
if (!connectionString) throw new Error('需要设置 PGDATABASE_URL；审计脚本拒绝回退到本地内存库');

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, options: '-c timezone=Asia/Shanghai' });
const fields = [
  ['activities', ['id', 'start_time', 'end_time', 'registration_start_time', 'registration_end_time']],
  ['activity_submissions', ['id', 'start_time', 'end_time', 'registration_start_time', 'registration_end_time']],
  ['leave_requests', ['id', 'start_time', 'end_time']],
  ['leave_slips', ['id', 'start_time', 'end_time', 'created_at', 'reviewed_at']],
  ['original_leave_slips', ['id', 'start_time', 'end_time', 'created_at']],
];

const parseWall = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  return Number.isNaN(date.getTime()) ? null : `${year}-${month}-${day}T${hour}:${minute}:${second}`;
};

const findings = [];
try {
  for (const [table, columns] of fields) {
    const exists = await pool.query('SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2', ['public', table]);
    if (!exists.rowCount) continue;
    const result = await pool.query(`SELECT ${columns.map((column) => `"${column}"`).join(', ')} FROM "${table}"`);
    for (const row of result.rows) {
      for (const field of columns.slice(1)) {
        const raw = row[field];
        if (raw === null || raw === undefined || raw === '') continue;
        const parsed = parseWall(raw);
        const reason = parsed ? null : '无法按统一时间格式解析';
        if (reason || (field.includes('start') && row.end_time && parsed && parseWall(row.end_time) && parsed > parseWall(row.end_time))) {
          findings.push({ table, id: row.id, field, originalValue: raw, interpretedShanghai: parsed, suspectedEightHourOffset: false, reason: reason || '开始时间晚于结束时间', recommendation: '人工核对原始材料后再生成修正 SQL', confidence: 'low' });
        }
      }
    }
  }
  const report = { generatedAt: new Date().toISOString(), timezone: 'Asia/Shanghai', readOnly: true, findings };
  await mkdir('cn_debug', { recursive: true });
  const output = `cn_debug/${new Date().toISOString().slice(0, 10)}_time-audit.json`;
  await writeFile(output, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ output, findings: findings.length, readOnly: true }));
} finally {
  await pool.end();
}
