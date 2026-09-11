import assert from 'node:assert/strict';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';
import { createNotification, resolveNotifications } from '@/lib/notifications';
import { notifyPermissionHolders } from '@/lib/notify-permission-holders';

async function createUser(options: { canPublish?: boolean; canScore?: boolean; department?: string | null }) {
  const suffix = `${Date.now()}-${Math.random()}`;
  const row = await queryOne<{ id: string }>(
    "INSERT INTO users (username,password,student_id,role,department,can_publish,can_score) VALUES ($1,'test',$2,'student',$3,$4,$5) RETURNING id",
    [`通知测试${suffix}`, `notify-${suffix}`, options.department ?? '学生会', options.canPublish ?? false, options.canScore ?? false],
  );
  if (!row) throw new Error('测试用户创建失败');
  return { id: row.id, name: `通知测试${suffix}` };
}

async function main() {
  await ensureDatabaseSchema();
  const publisher = await createUser({ canPublish: true, department: '学生会' });
  const outsider = await createUser({ canPublish: false });
  // 权限与主办范围互相独立：其他部门但拥有审核权限的人同样要收到通知
  const crossDeptPublisher = await createUser({ canPublish: true, department: '其他学院' });
  const scorer = await createUser({ canScore: true });

  try {
    // 活动提交后：通知所有拥有审核权限的人（不再按主办范围过滤）
    const notified = await notifyPermissionHolders({
      permission: 'canPublish',
      type: 'activity_pending_review',
      title: '有新的活动待审核',
      content: '活动「测试活动」已提交，等待审核。',
      relatedId: 'submission-1',
    });
    assert.ok(notified >= 2, `应至少通知 2 人，实际 ${notified}`);

    const publisherRows = await query<{ title: string; status: string }>(
      "SELECT title,status FROM notifications WHERE user_id=$1 AND related_id='submission-1'",
      [publisher.id],
    );
    assert.equal(publisherRows.length, 1);
    assert.equal(publisherRows[0].status, '待处理');

    // 跨部门但有权限的人也要收到
    const crossDeptRows = await query('SELECT id FROM notifications WHERE user_id=$1', [crossDeptPublisher.id]);
    assert.equal(crossDeptRows.length, 1);

    // 没有该权限的人不通知
    const outsiderRows = await query('SELECT id FROM notifications WHERE user_id=$1', [outsider.id]);
    assert.equal(outsiderRows.length, 0);

    // 处理完之后：同一条通知的内容与状态被改写
    await resolveNotifications({
      relatedIds: ['submission-1'],
      types: ['activity_pending_review'],
      title: '活动审核通过',
      content: '活动「测试活动」已由 管理员 审核通过。',
    });
    const resolved = await queryOne<{ title: string; content: string; status: string }>(
      'SELECT title,content,status FROM notifications WHERE user_id=$1 AND related_id=$2',
      [publisher.id, 'submission-1'],
    );
    assert.equal(resolved?.status, '已处理');
    assert.equal(resolved?.title, '活动审核通过');
    assert.ok(String(resolved?.content).includes('审核通过'));

    // 赋分完成通知照常写入
    await createNotification(scorer.id, 'activity_scored', '活动赋分完成', '你的活动已完成赋分', 'activity-1');
    const scoredRows = await query('SELECT id FROM notifications WHERE user_id=$1 AND related_id=$2', [scorer.id, 'activity-1']);
    assert.equal(scoredRows.length, 1);
  } finally {
    for (const user of [publisher, outsider, crossDeptPublisher, scorer]) {
      await query('DELETE FROM notifications WHERE user_id=$1', [user.id]);
      await query('DELETE FROM users WHERE id=$1', [user.id]);
    }
  }
  console.log('notification lifecycle tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});