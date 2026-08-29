import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { CATEGORIES } from '@/lib/types';
import { createOtherCollegeActivityId, isOtherCollege } from '@/lib/other-college-registration';
import { queryOne } from '@/storage/database/supabase-client';
import { readIdempotencyKey, scopeIdempotencyKey } from '@/lib/idempotency';
import { isValidDateRange } from '@/lib/other-college-validation';

type RegistrationBody = {
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
  const organizer = requiredText(body.organizer);
  const category = requiredText(body.category);
  const startTime = requiredText(body.startTime);
  const endTime = requiredText(body.endTime);
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
  if (!isValidDateRange(startTime, endTime)) {
    return NextResponse.json({ success: false, error: '活动结束时间不能早于开始时间' }, { status: 400 });
  }

  const data = await queryOne(
    'INSERT INTO activities (id,full_name,start_time,end_time,category,level,plan_file_url,record_file_url,record_photo_url,record_photo_file_name,leader_name,leader_phone,scope_type,scope_name,scope_names,scoring_material_submitter_id,scoring_material_submitter_name,scoring_material_submitter_student_id,scoring_table_url,scoring_table_file_name,status,scoring_status,idempotency_key) ' +
    "VALUES ($1,$2,$3,$4,$5,'校级',NULL,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'正常活动','待赋分',$18) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *",
    [
      createOtherCollegeActivityId(), fullName, startTime, endTime, category, recordPhotoUrl, recordPhotoFileName,
      leaderName, contactPhone, 'other_college', organizer, JSON.stringify([{ type: 'other_college', name: organizer }]),
      auth.user!.id, auth.user!.username, auth.user!.student_id, scoringTableUrl, scoringTableFileName, idempotencyKey,
    ],
  );
  if (!data) {
    const repeated = await queryOne('SELECT * FROM activities WHERE idempotency_key=$1', [idempotencyKey]);
    if (!repeated) return NextResponse.json({ success: false, error: '提交未完成，请重试' }, { status: 409 });
    return NextResponse.json({ success: true, data: repeated });
  }
  return NextResponse.json({ success: true, data });
}
