import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { CATEGORIES } from '@/lib/types';
import { createOtherCollegeActivityId, isOtherCollege } from '@/lib/other-college-registration';
import { query, queryOne, withActivityWallTime, withTransaction } from '@/storage/database/supabase-client';
import { readIdempotencyKey, scopeIdempotencyKey } from '@/lib/idempotency';
import { isValidDateRange } from '@/lib/other-college-validation';
import { writeAuditLog } from '@/lib/audit-log';
import { normalizeDateTimeInput } from '@/lib/datetime';

type RegistrationBody = {
  id?: unknown;
  fullName?: unknown;
  organizer?: unknown;
  category?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  leaderName?: unknown;
  contactPhone?: unknown;
  scoringTableUrl?: unknown;
  scoringTableFileName?: unknown;
  recordPhotoUrl?: unknown;
  recordPhotoFileName?: unknown;
};

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requirePermission(request, 'registerOtherCollege');
  if (auth.response) return auth.response;
  try {
    const data = await query(
      'SELECT id,full_name,start_time,end_time,category,scope_name,leader_name,leader_phone,scoring_status,scoring_table_url,scoring_table_file_name,record_photo_url,record_photo_file_name,submission_count,created_at FROM activities WHERE scope_type=$1 AND scoring_material_submitter_id=$2 ORDER BY created_at DESC LIMIT 100',
      ['other_college', auth.user!.id],
    );
    return NextResponse.json({ success: true, data: data.map((item) => withActivityWallTime(item)) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '查询登记记录失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requirePermission(request, 'registerOtherCollege');
  if (auth.response) return auth.response;
  const requestKey = readIdempotencyKey(request.headers);
  if (!requestKey) return NextResponse.json({ success: false, error: '缺少或无效的幂等请求标识' }, { status: 400 });
  const idempotencyKey = scopeIdempotencyKey(auth.user!.id, requestKey);

  let body: RegistrationBody;
  try {
    body = await request.json() as RegistrationBody;
  } catch {
    return NextResponse.json({ success: false, error: '请求数据格式不正确' }, { status: 400 });
  }

  const fullName = requiredText(body.fullName);
  const submissionId = requiredText(body.id);
  const organizer = requiredText(body.organizer);
  const category = requiredText(body.category);
  const startTime = requiredText(body.startTime);
  const endTime = requiredText(body.endTime);
  const normalizedStartTime = startTime ? normalizeDateTimeInput(startTime) : null;
  const normalizedEndTime = endTime ? normalizeDateTimeInput(endTime) : null;
  const leaderName = requiredText(body.leaderName);
  const contactPhone = requiredText(body.contactPhone);
  const scoringTableUrl = requiredText(body.scoringTableUrl);
  const scoringTableFileName = requiredText(body.scoringTableFileName);
  const recordPhotoUrl = requiredText(body.recordPhotoUrl);
  const recordPhotoFileName = requiredText(body.recordPhotoFileName);

  if (!fullName || !organizer || !category || !startTime || !endTime || !leaderName || !contactPhone || !scoringTableUrl || !scoringTableFileName || !recordPhotoUrl || !recordPhotoFileName) {
    return NextResponse.json({ success: false, error: '请完整填写活动、负责人信息并上传赋分表、备案表照片' }, { status: 400 });
  }
  if (!isOtherCollege(organizer)) {
    return NextResponse.json({ success: false, error: '主办学院只能选择指定的四个学院' }, { status: 400 });
  }
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    return NextResponse.json({ success: false, error: '活动类别不正确' }, { status: 400 });
  }
  if (!normalizedStartTime || !normalizedEndTime || !isValidDateRange(normalizedStartTime, normalizedEndTime)) {
    return NextResponse.json({ success: false, error: '活动结束时间不能早于开始时间' }, { status: 400 });
  }

  try {
    const result = await withTransaction(async (client) => {
    if (submissionId) {
      const current = (await client.query<{ id: string; scoring_material_submitter_id: string | null; scoring_status: string }>('SELECT id,scoring_material_submitter_id,scoring_status FROM activities WHERE id=$1 AND scope_type=$2', [submissionId, 'other_college'])).rows[0];
      if (!current) throw Object.assign(new Error('原其他学院登记记录不存在'), { status: 404 });
      if (current.scoring_material_submitter_id !== auth.user!.id && auth.user!.role !== 'admin') throw Object.assign(new Error('只能由原提交人重新提交登记'), { status: 403 });
      if (current.scoring_status === '已赋分') throw Object.assign(new Error('已赋分的登记不能重新提交'), { status: 400 });
      const updated = (await client.query(
        `UPDATE activities SET full_name=$1,start_time=$2,end_time=$3,category=$4,scope_name=$5,scope_names=$6,scoring_material_submitter_id=$7,scoring_material_submitter_name=$8,scoring_material_submitter_student_id=$9,scoring_table_url=$10,scoring_table_file_name=$11,record_photo_url=$12,record_photo_file_name=$13,scoring_status='待赋分',submission_count=COALESCE(submission_count,1)+1,idempotency_key=$14,updated_at=NOW() WHERE id=$15 AND scoring_status<>'已赋分' RETURNING *`,
        [fullName, normalizedStartTime, normalizedEndTime, category, organizer, JSON.stringify([{ type: 'other_college', name: organizer }]), auth.user!.id, auth.user!.username, auth.user!.student_id, scoringTableUrl, scoringTableFileName, recordPhotoUrl, recordPhotoFileName, idempotencyKey, submissionId],
      )).rows[0] as Record<string, unknown> | undefined;
      if (!updated) throw Object.assign(new Error('登记状态已变化，请刷新后重试'), { status: 409 });
      await writeAuditLog({ actor: auth.user, action: 'resubmit_other_college_registration', resourceType: 'activity', resourceId: submissionId, details: { submissionCount: updated.submission_count } }, client);
      return { data: updated, created: false };
    }
    const repeated = (await client.query('SELECT * FROM activities WHERE idempotency_key=$1', [idempotencyKey])).rows[0] as Record<string, unknown> | undefined;
    if (repeated) return { data: repeated, created: false };
    const data = (await client.query(
      'INSERT INTO activities (id,full_name,start_time,end_time,category,level,plan_file_url,record_file_url,record_photo_url,record_photo_file_name,leader_name,leader_phone,scope_type,scope_name,scope_names,scoring_material_submitter_id,scoring_material_submitter_name,scoring_material_submitter_student_id,scoring_table_url,scoring_table_file_name,status,scoring_status,idempotency_key) ' +
      "VALUES ($1,$2,$3,$4,$5,'校级',NULL,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'正常活动','待赋分',$18) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *",
      [
        createOtherCollegeActivityId(), fullName, normalizedStartTime, normalizedEndTime, category, recordPhotoUrl, recordPhotoFileName,
        leaderName, contactPhone, 'other_college', organizer, JSON.stringify([{ type: 'other_college', name: organizer }]),
        auth.user!.id, auth.user!.username, auth.user!.student_id, scoringTableUrl, scoringTableFileName, idempotencyKey,
      ],
    )).rows[0] as Record<string, unknown> | undefined;
    if (!data) return { data: (await client.query('SELECT * FROM activities WHERE idempotency_key=$1', [idempotencyKey])).rows[0] as Record<string, unknown> | undefined, created: false };
    await writeAuditLog({ actor: auth.user, action: 'create_other_college_registration', resourceType: 'activity', resourceId: String(data.id), details: { status: '正常活动', scoringStatus: '待赋分' } }, client);
    return { data, created: true };
  });
  if (!result.data) return NextResponse.json({ success: false, error: '提交未完成，请重试' }, { status: 409 });
  if (!result.created && result.data.scoring_material_submitter_id !== auth.user!.id && auth.user!.role !== 'admin') return NextResponse.json({ success: false, error: '重复请求标识已被其他用户使用' }, { status: 409 });
    return NextResponse.json({ success: true, data: withActivityWallTime(result.data) });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '登记失败' }, { status });
  }
}
