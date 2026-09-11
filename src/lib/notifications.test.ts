import assert from 'node:assert/strict';
import { createNotification } from '@/lib/notifications';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

async function createTestUser() {
  const result = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id) VALUES ($1,$2,$3) RETURNING id",
    [`通知用户${Date.now()}${Math.random()}`, 'test', `notify-test-${Date.now()}-${Math.random()}`],
  );
  if (!result) throw new Error('测试用户创建失败');
  return result;
}

async function main() {
  await ensureDatabaseSchema();
  const user = await createTestUser();

  assert.equal(await createNotification(user.id, 'test', '审核结果', '你的通知已通过'), true);

  const rows = await query<{ type: string; title: string; content: string; is_read: string }>(
    'SELECT type,title,content,is_read FROM notifications WHERE user_id=$1',
    [user.id],
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { type: rows[0].type, title: rows[0].title, content: rows[0].content },
    { type: 'test', title: '审核结果', content: '你的通知已通过' },
  );

  await query('DELETE FROM notifications WHERE user_id=$1', [user.id]);
  await query('DELETE FROM users WHERE id=$1', [user.id]);
  console.log('notification tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});