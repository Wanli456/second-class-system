import assert from 'node:assert/strict';
import { normalizeDateTimeInput } from '../../lib/datetime';
import { query, withWallTimes } from './supabase-client';

// 全链路：前端 datetime-local 原值 → 归一化入库 → 读回还原 → 编辑回填 → 再提交，墙钟保持不变。
async function main() {
  const start = normalizeDateTimeInput('2026-08-27T20:00');
  const end = normalizeDateTimeInput('2026-08-28T08:30');
  assert.equal(start, '2026-08-27T20:00:00');
  assert.equal(end, '2026-08-28T08:30:00');

  await query('CREATE TABLE IF NOT EXISTS wall_time_probe (id TEXT PRIMARY KEY, start_time TIMESTAMP, end_time TIMESTAMP)');
  await query('DELETE FROM wall_time_probe');
  await query('INSERT INTO wall_time_probe (id, start_time, end_time) VALUES ($1, $2, $3)', ['probe', start, end]);

  const rows = withWallTimes(await query<{ start_time: unknown; end_time: unknown }>('SELECT * FROM wall_time_probe WHERE id=$1', ['probe']));
  assert.equal(rows[0].start_time, '2026-08-27T20:00:00');
  assert.equal(rows[0].end_time, '2026-08-28T08:30:00');

  // 编辑回填：截取前 16 位就是 datetime-local 的原值
  const refill = String(rows[0].start_time).slice(0, 16);
  assert.equal(refill, '2026-08-27T20:00');
  // 回填值再提交，往返稳定
  assert.equal(normalizeDateTimeInput(refill), start);

  await query('DROP TABLE wall_time_probe');
  console.log('wall time round-trip tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
