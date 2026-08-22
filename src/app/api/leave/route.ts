import { NextRequest, NextResponse } from 'next/server';
import { createNotification } from '@/app/api/notifications/route';
import { requirePermission, requireUser } from '@/lib/auth';
import { canResubmitGroupLeave, canStartGroupLeave, includeApplicantStudent, parseDateOnly } from '@/lib/business-rules';
import { query, queryOne, withTransaction } from '@/storage/database/supabase-client';

const REVIEW_STATUSES = ['待审核', '已通过', '已驳回'];

class SelfReviewLeaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelfReviewLeaveError';
  }
}

function dateCondition(index: number) {
  const dateParam = `$${index}`;
  // datetime-local values are submitted as UTC ISO strings but the database
  // columns are TIMESTAMP without time zone. Convert the selected China day
  // to its UTC-stored range before checking whether a leave overlaps it.
  return `(
    (
      start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND start_time < ((${dateParam}::timestamp + INTERVAL '1 day') - INTERVAL '8 hours')
      AND end_time > (${dateParam}::timestamp - INTERVAL '8 hours')
    )
    OR (start_time IS NULL AND (created_at + INTERVAL '8 hours')::date = ${dateParam})
  )`;
}

function validTimes(startTime: unknown, endTime: unknown) {
  if (typeof startTime !== 'string' || typeof endTime !== 'string') return false;
  const start = new Date(startTime);
  const end = new Date(endTime);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
}

async function resolveActivity(activityId: unknown, leaveType: string) {
  if (leaveType !== '活动公假') return { activityId: null, activityName: null };
  const id = String(activityId || '').trim();
  if (!id) throw new Error('活动公假必须选择系统中的活动');
  const activity = await queryOne<{ id: string; full_name: string }>("SELECT id,full_name FROM activities WHERE id=$1 AND status='正常活动'", [id]);
  if (!activity) throw new Error('所选活动不存在或已取消，无法提交活动公假');
  return { activityId: activity.id, activityName: activity.full_name };
}

async function notifyStudent(studentId: string, type: string, title: string, content: string, relatedId: string) {
  const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE student_id=$1 LIMIT 1', [studentId]);
  if (user) await createNotification(user.id, type, title, content, relatedId);
}

async function rosterStudents(className: string, studentIds: string[]) {
  if (!studentIds.length) return [];
  const placeholders = studentIds.map((_, index) => `$${index + 2}`).join(',');
  return query<{ student_id: string; student_name: string; class_name: string }>(
    `SELECT student_id,student_name,class_name FROM class_roster WHERE class_name=$1 AND student_id IN (${placeholders}) ORDER BY student_id`,
    [className, ...studentIds],
  );
}

async function groupRecords(groupId: string) {
  return query('SELECT * FROM leave_requests WHERE group_id=$1 ORDER BY student_id', [groupId]);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const groupId = searchParams.get('group_id');
    const className = searchParams.get('class');
    const date = parseDateOnly(searchParams.get('date'));
    const reviewMode = searchParams.get('role') === 'admin';

    if (groupId) {
      const auth = await requirePermission(request, 'reviewLeave');
      if (auth.response) return auth.response;
      const group = await queryOne('SELECT * FROM leave_groups WHERE id=$1', [groupId]);
      if (!group) return NextResponse.json({ success: true, data: [], group: null });
      return NextResponse.json({ success: true, data: await groupRecords(groupId), group });
    }

    if (id) {
      const auth = await requireUser(request);
      if (auth.response) return auth.response;
      const leave = await queryOne<{ applicant_user_id?: string | null; student_id: string; group_id?: string | null }>('SELECT * FROM leave_requests WHERE id=$1', [id]);
      if (!leave) return NextResponse.json({ success: true, data: [] });
      const allowed = auth.user!.role === 'admin' || leave.applicant_user_id === auth.user!.id || leave.student_id === auth.user!.student_id;
      if (!allowed) return NextResponse.json({ success: false, error: '无权查看该请假申请' }, { status: 403 });
      if (!leave.group_id) return NextResponse.json({ success: true, data: [leave] });
      const group = await queryOne('SELECT * FROM leave_groups WHERE id=$1', [leave.group_id]);
      return NextResponse.json({ success: true, data: await groupRecords(leave.group_id), group });
    }

    if (reviewMode) {
      const auth = await requirePermission(request, 'reviewLeave');
      if (auth.response) return auth.response;
      const status = searchParams.get('status');
      const individualWhere = status ? 'WHERE group_id IS NULL AND review_status=$1' : 'WHERE group_id IS NULL';
      const groupWhere = status ? 'WHERE review_status=$1' : '';
      const params = status ? [status] : [];
      const [data, groupRows] = await Promise.all([
        query(`SELECT * FROM leave_requests ${individualWhere} ORDER BY created_at DESC`, params),
        query(`SELECT * FROM leave_groups ${groupWhere} ORDER BY created_at DESC`, params),
      ]);
      const groupIds = groupRows.map((group) => String(group.id));
      const members = groupIds.length
        ? await query(`SELECT group_id FROM leave_group_members WHERE group_id IN (${groupIds.map((_, index) => `$${index + 1}`).join(',')})`, groupIds)
        : [];
      const memberCounts = new Map<string, number>();
      for (const member of members) {
        const groupId = String(member.group_id);
        memberCounts.set(groupId, (memberCounts.get(groupId) || 0) + 1);
      }
      const groups = groupRows.map((group) => ({ ...group, member_count: memberCounts.get(String(group.id)) || 0 }));
      return NextResponse.json({ success: true, data, groups });
    }

    if (className || date) {
      const auth = await requirePermission(request, 'eveningStudy');
      if (auth.response) return auth.response;
      if (!className || !date) return NextResponse.json({ success: false, error: '请同时选择班级和查询日期' }, { status: 400 });
      const data = await query(`SELECT * FROM leave_requests WHERE class_name ILIKE $1 AND ${dateCondition(2)} ORDER BY start_time ASC,created_at DESC`, [className, date]);
      const approved = data.filter((item) => item.review_status === '已通过');
      const pending = data.filter((item) => item.review_status === '待审核');
      const groupIds = [...new Set(data.map((item) => item.group_id).filter(Boolean))] as string[];
      const members = groupIds.length ? await query(`SELECT * FROM leave_group_members WHERE group_id IN (${groupIds.map((_, index) => `$${index + 1}`).join(',')})`, groupIds) : [];
      return NextResponse.json({ success: true, data, stats: { approvedCount: approved.length, pendingCount: pending.length, rejectedCount: data.length - approved.length - pending.length }, students: approved, pendingStudents: pending, groupMembers: members, date, className });
    }

    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const directlyVisible = await query('SELECT * FROM leave_requests WHERE student_id=$1 OR applicant_user_id=$2', [auth.user!.student_id, auth.user!.id]);
    const groupIds = [...new Set(directlyVisible.map((item) => item.group_id).filter(Boolean))] as string[];
    const relatedGroupRecords = groupIds.length
      ? await query(`SELECT * FROM leave_requests WHERE group_id IN (${groupIds.map((_, index) => `$${index + 1}`).join(',')})`, groupIds)
      : [];
    const data = [...new Map([...directlyVisible, ...relatedGroupRecords].map((item) => [item.id, item])).values()]
      .sort((left, right) => new Date(String(right.created_at)).getTime() - new Date(String(left.created_at)).getTime());
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '查询请假数据失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const user = auth.user!;
    const body = await request.json();
    const { leave_request_id, mode = 'individual', leave_type, leave_image_url, leave_image_name, activity_id, start_time, end_time } = body;
    if (!leave_type || !validTimes(start_time, end_time)) return NextResponse.json({ success: false, error: '请填写请假类型以及有效的开始、结束时间' }, { status: 400 });
    const activity = await resolveActivity(activity_id, leave_type);

    if (leave_request_id) {
      const existing = await queryOne<{ id: string; group_id?: string | null; applicant_user_id?: string | null; review_status: string; leave_image_url?: string | null; leave_image_name?: string | null }>('SELECT * FROM leave_requests WHERE id=$1', [leave_request_id]);
      if (!existing) return NextResponse.json({ success: false, error: '原请假申请不存在' }, { status: 404 });
      if (!existing.group_id) {
        if (existing.applicant_user_id && existing.applicant_user_id !== user.id) return NextResponse.json({ success: false, error: '只能重新提交自己的请假申请' }, { status: 403 });
        if (existing.review_status === '已通过') return NextResponse.json({ success: false, error: '已通过的请假申请不能重新提交' }, { status: 400 });
        const data = await queryOne(`UPDATE leave_requests SET leave_type=$1,leave_image_url=$2,leave_image_name=$3,activity_id=$4,activity_name=$5,applicant_user_id=$6,applicant_name=$7,applicant_student_id=$8,start_time=$9,end_time=$10,review_status='待审核',review_note=NULL,updated_at=NOW() WHERE id=$11 RETURNING *`, [leave_type, leave_image_url || existing.leave_image_url || null, leave_image_name || existing.leave_image_name || null, activity.activityId, activity.activityName, user.id, user.username, user.student_id, start_time, end_time, leave_request_id]);
        return NextResponse.json({ success: true, data });
      }

      const group = await queryOne<{ id: string; class_name: string; applicant_user_id: string; review_status: string }>('SELECT * FROM leave_groups WHERE id=$1', [existing.group_id]);
      if (!group) return NextResponse.json({ success: false, error: '原集体请假组不存在' }, { status: 404 });
      if (!canResubmitGroupLeave(user.id, group)) return NextResponse.json({ success: false, error: '仅发起人可重新提交未通过的集体请假' }, { status: 403 });
      const requestedIds = includeApplicantStudent(Array.isArray(body.student_ids) ? body.student_ids.map(String).filter(Boolean) : [], user.student_id);
      const students = await rosterStudents(group.class_name, requestedIds);
      if (students.length !== requestedIds.length) return NextResponse.json({ success: false, error: '集体请假学生必须全部来自本班花名册' }, { status: 400 });
      const result = await withTransaction(async (client) => {
        await client.query(`UPDATE leave_groups SET leave_type=$1,activity_id=$2,activity_name=$3,start_time=$4,end_time=$5,review_status='待审核',review_note=NULL,updated_at=NOW() WHERE id=$6`, [leave_type, activity.activityId, activity.activityName, start_time, end_time, group.id]);
        await client.query('DELETE FROM leave_group_members WHERE group_id=$1', [group.id]);
        await client.query('DELETE FROM leave_requests WHERE group_id=$1', [group.id]);
        const created = [];
        for (const student of students) {
          const leave = (await client.query(`INSERT INTO leave_requests (student_id,class_name,student_name,leave_type,leave_image_url,leave_image_name,activity_id,activity_name,applicant_user_id,applicant_name,applicant_student_id,group_id,start_time,end_time,review_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'待审核') RETURNING *`, [student.student_id, group.class_name, student.student_name, leave_type, leave_image_url || existing.leave_image_url || null, leave_image_name || existing.leave_image_name || null, activity.activityId, activity.activityName, user.id, user.username, user.student_id, group.id, start_time, end_time])).rows[0];
          created.push(leave);
          await client.query('INSERT INTO leave_group_members (group_id,student_id,student_name,class_name,leave_request_id) VALUES ($1,$2,$3,$4,$5)', [group.id, student.student_id, student.student_name, group.class_name, leave.id]);
        }
        return created;
      });
      return NextResponse.json({ success: true, data: result, group: { ...group, leave_type, activity_id: activity.activityId, activity_name: activity.activityName, start_time, end_time, review_status: '待审核', review_note: null } });
    }

    if (mode === 'group') {
      if (!canStartGroupLeave(user)) return NextResponse.json({ success: false, error: '当前账号没有班级集体请假发起权限或班级信息' }, { status: 403 });
      const requestedIds = includeApplicantStudent(Array.isArray(body.student_ids) ? body.student_ids.map(String).filter(Boolean) : [], user.student_id);
      const students = await rosterStudents(user.class_name!, requestedIds);
      if (!requestedIds.length || students.length !== requestedIds.length) return NextResponse.json({ success: false, error: '集体请假学生必须全部来自本班花名册，且发起人必须包含在内' }, { status: 400 });
      const result = await withTransaction(async (client) => {
        const group = (await client.query(`INSERT INTO leave_groups (class_name,applicant_user_id,applicant_name,applicant_student_id,leave_type,activity_id,activity_name,start_time,end_time,review_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'待审核') RETURNING *`, [user.class_name, user.id, user.username, user.student_id, leave_type, activity.activityId, activity.activityName, start_time, end_time])).rows[0];
        const created = [];
        for (const student of students) {
          const leave = (await client.query(`INSERT INTO leave_requests (student_id,class_name,student_name,leave_type,leave_image_url,leave_image_name,activity_id,activity_name,applicant_user_id,applicant_name,applicant_student_id,group_id,start_time,end_time,review_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'待审核') RETURNING *`, [student.student_id, user.class_name, student.student_name, leave_type, leave_image_url || null, leave_image_name || null, activity.activityId, activity.activityName, user.id, user.username, user.student_id, group.id, start_time, end_time])).rows[0];
          created.push(leave);
          await client.query('INSERT INTO leave_group_members (group_id,student_id,student_name,class_name,leave_request_id) VALUES ($1,$2,$3,$4,$5)', [group.id, student.student_id, student.student_name, user.class_name, leave.id]);
        }
        return { group, created };
      });
      return NextResponse.json({ success: true, data: result.created, group: result.group });
    }

    const data = await queryOne(`INSERT INTO leave_requests (student_id,class_name,student_name,leave_type,leave_image_url,leave_image_name,activity_id,activity_name,applicant_user_id,applicant_name,applicant_student_id,start_time,end_time,review_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'待审核') RETURNING *`, [user.student_id, user.class_name || '未填写', user.username, leave_type, leave_image_url || null, leave_image_name || null, activity.activityId, activity.activityName, user.id, user.username, user.student_id, start_time, end_time]);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '提交请假失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'reviewLeave');
    if (auth.response) return auth.response;
    const { id, group_id, review_status, review_note } = await request.json();
    if ((!id && !group_id) || !REVIEW_STATUSES.includes(review_status)) return NextResponse.json({ success: false, error: '缺少或无效的审核参数' }, { status: 400 });
    if (!group_id) {
      const leave = await queryOne<{ applicant_user_id?: string | null; student_id: string }>(
        `SELECT applicant_user_id, student_id FROM leave_requests WHERE id=$1 AND group_id IS NULL AND review_status='待审核'`,
        [id],
      );
      if (!leave) return NextResponse.json({ success: false, error: '请假申请不存在或已处理' }, { status: 409 });
      if (leave.applicant_user_id === auth.user!.id || (!leave.applicant_user_id && leave.student_id === auth.user!.student_id)) {
        throw new SelfReviewLeaveError('不能审核自己提交的请假申请');
      }
      const data = await queryOne(`UPDATE leave_requests SET review_status=$1,review_note=$2,updated_at=NOW() WHERE id=$3 AND group_id IS NULL AND review_status='待审核' RETURNING *`, [review_status, review_note || null, id]);
      if (!data) return NextResponse.json({ success: false, error: '请假申请不存在或已处理' }, { status: 409 });
      await notifyStudent(data.student_id, review_status === '已通过' ? 'leave_approved' : 'leave_rejected', review_status === '已通过' ? '请假审核通过' : '请假被驳回', `${data.leave_type}${review_status === '已通过' ? '已通过审核' : `未通过审核。${review_note ? `原因：${review_note}` : ''}`}`, data.id);
      return NextResponse.json({ success: true, data });
    }
    const result = await withTransaction(async (client) => {
      const group = (await client.query('SELECT * FROM leave_groups WHERE id=$1', [group_id])).rows[0] as { review_status: string; applicant_user_id?: string | null } | undefined;
      if (!group || group.review_status !== '待审核') throw new Error('集体请假组不存在或已处理');
      if (group.applicant_user_id === auth.user!.id) throw new SelfReviewLeaveError('不能审核自己发起的集体请假');
      const updatedGroup = (await client.query(`UPDATE leave_groups SET review_status=$1,review_note=$2,updated_at=NOW() WHERE id=$3 AND review_status='待审核' RETURNING *`, [review_status, review_note || null, group_id])).rows[0];
      if (!updatedGroup) throw new Error('集体请假状态已发生变化，请刷新后重试');
      const leaves = (await client.query(`UPDATE leave_requests SET review_status=$1,review_note=$2,updated_at=NOW() WHERE group_id=$3 AND review_status='待审核' RETURNING *`, [review_status, review_note || null, group_id])).rows;
      if (!leaves.length) throw new Error('集体请假成员不存在，未执行审核');
      return { group: updatedGroup, leaves };
    });
    for (const item of result.leaves) await notifyStudent(String(item.student_id), review_status === '已通过' ? 'leave_approved' : 'leave_rejected', review_status === '已通过' ? '集体请假审核通过' : '集体请假被驳回', `集体请假「${item.activity_name || item.leave_type}」${review_status === '已通过' ? '已通过审核' : `未通过审核。${review_note ? `原因：${review_note}` : ''}`}`, String(item.id));
    return NextResponse.json({ success: true, data: result.leaves, group: result.group });
  } catch (error) {
    if (error instanceof SelfReviewLeaveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '审核请假失败' }, { status: 500 });
  }
}
