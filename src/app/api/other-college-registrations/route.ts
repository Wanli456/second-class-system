import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { CATEGORIES } from '@/lib/types';
import { createOtherCollegeActivityId, isOtherCollege } from '@/lib/other-college-registration';
import { query, withActivityWallTime, withTransaction, type DatabaseClient } from '@/storage/database/supabase-client';
import { readIdempotencyKey, scopeIdempotencyKey } from '@/lib/idempotency';
import { isValidDateRange } from '@/lib/other-college-validation';
import { writeAuditLog } from '@/lib/audit-log';
import { normalizeDateTimeInput } from '@/lib/datetime';
import { getUploadFileKind } from '@/lib/upload-file-validation';
import { parseRecordPhotoInputs, parseStoredRecordPhotos, type RecordPhoto } from '@/lib/other-college-record-photos';

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
  recordPhotos?: unknown;
};

type UploadAsset = { url: string; original_file_name: string | null; uploaded_by_user_id: string | null };
type ExistingActivity = {
  id: string;
  scoring_material_submitter_id: string | null;
  scoring_status: string;
  record_photo_list: string | null;
  record_photo_url: string | null;
  record_photo_file_name: string | null;
};

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requestError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

async function resolveRecordPhotos(
  client: DatabaseClient,
  photos: RecordPhoto[],
  existingPhotos: RecordPhoto[],
  userId: string,
): Promise<RecordPhoto[]> {
  if (!photos.length) return [];
  const placeholders = photos.map((_photo, index) => '$' + (index + 1)).join(',');
  const assets = (await client.query<UploadAsset>(
    'SELECT url,original_file_name,uploaded_by_user_id FROM upload_assets WHERE url IN (' + placeholders + ')',
    photos.map((photo) => photo.url),
  )).rows;
  const assetsByUrl = new Map(assets.map((asset) => [asset.url, asset]));
  const existingByUrl = new Map(existingPhotos.map((photo) => [photo.url, photo]));

  return photos.map((photo) => {
    const asset = assetsByUrl.get(photo.url);
    const existing = existingByUrl.get(photo.url);
    if (!existing && (!asset || asset.uploaded_by_user_id !== userId)) {
      throw requestError('只能提交自己上传的备案表照片', 403);
    }
    if (!existing && getUploadFileKind(asset?.original_file_name || photo.fileName) !== 'image') {
      throw requestError('备案表照片必须是图片文件', 400);
    }
    return { url: photo.url, fileName: asset?.original_file_name || existing?.fileName || photo.fileName };
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requirePermission(request, 'registerOtherCollege');
  if (auth.response) return auth.response;
  try {
    const data = await query(
      'SELECT id,full_name,start_time,end_time,category,scope_name,leader_name,leader_phone,scoring_status,scoring_table_url,scoring_table_file_name,record_photo_url,record_photo_file_name,record_photo_list,submission_count,created_at FROM activities WHERE scope_type=$1 AND scoring_material_submitter_id=$2 ORDER BY created_at DESC LIMIT 100',
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
  let requestedPhotos: RecordPhoto[];
  try {
    requestedPhotos = parseRecordPhotoInputs(body.recordPhotos, body.recordPhotoUrl, body.recordPhotoFileName);
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '备案表照片格式不正确' }, { status: 400 });
  }

  if (!fullName || !organizer || !category || !startTime || !endTime || !scoringTableUrl || !scoringTableFileName) {
    return NextResponse.json({ success: false, error: '请完整填写活动信息并上传赋分表' }, { status: 400 });
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
        const current = (await client.query<ExistingActivity>(
          'SELECT id,scoring_material_submitter_id,scoring_status,record_photo_list,record_photo_url,record_photo_file_name FROM activities WHERE id=$1 AND scope_type=$2',
          [submissionId, 'other_college'],
        )).rows[0];
        if (!current) throw requestError('原其他学院登记记录不存在', 404);
        if (current.scoring_material_submitter_id !== auth.user!.id && auth.user!.role !== 'admin') {
          throw requestError('只能由原提交人重新提交登记', 403);
        }
        if (current.scoring_status === '已赋分') throw requestError('已赋分的登记不能重新提交', 400);
        const photos = await resolveRecordPhotos(
          client,
          requestedPhotos,
          parseStoredRecordPhotos(current.record_photo_list, current.record_photo_url, current.record_photo_file_name),
          auth.user!.id,
        );
        const primary = photos[0] || null;
        const updated = (await client.query(
          "UPDATE activities SET full_name=$1,start_time=$2,end_time=$3,category=$4,leader_name=$5,leader_phone=$6,scope_name=$7,scope_names=$8,scoring_material_submitter_id=$9,scoring_material_submitter_name=$10,scoring_material_submitter_student_id=$11,scoring_table_url=$12,scoring_table_file_name=$13,record_photo_list=$14,record_photo_url=$15,record_photo_file_name=$16,scoring_status='待赋分',submission_count=COALESCE(submission_count,1)+1,idempotency_key=$17,updated_at=NOW() WHERE id=$18 AND scoring_status<>'已赋分' RETURNING *",
          [fullName, normalizedStartTime, normalizedEndTime, category, leaderName || '', contactPhone || '', organizer, JSON.stringify([{ type: 'other_college', name: organizer }]), auth.user!.id, auth.user!.username, auth.user!.student_id, scoringTableUrl, scoringTableFileName, JSON.stringify(photos), primary?.url || null, primary?.fileName || null, idempotencyKey, submissionId],
        )).rows[0] as Record<string, unknown> | undefined;
        if (!updated) throw requestError('登记状态已变化，请刷新后重试', 409);
        await writeAuditLog({ actor: auth.user, action: 'resubmit_other_college_registration', resourceType: 'activity', resourceId: submissionId, details: { submissionCount: updated.submission_count, recordPhotoCount: photos.length } }, client);
        return { data: updated, created: false };
      }

      const repeated = (await client.query('SELECT * FROM activities WHERE idempotency_key=$1', [idempotencyKey])).rows[0] as Record<string, unknown> | undefined;
      if (repeated) return { data: repeated, created: false };
      const photos = await resolveRecordPhotos(client, requestedPhotos, [], auth.user!.id);
      const primary = photos[0] || null;
      const data = (await client.query(
        "INSERT INTO activities (id,full_name,start_time,end_time,category,level,plan_file_url,record_file_url,record_photo_url,record_photo_file_name,record_photo_list,leader_name,leader_phone,scope_type,scope_name,scope_names,scoring_material_submitter_id,scoring_material_submitter_name,scoring_material_submitter_student_id,scoring_table_url,scoring_table_file_name,status,scoring_status,idempotency_key) VALUES ($1,$2,$3,$4,$5,'校级',NULL,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'正常活动','待赋分',$19) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *",
        [createOtherCollegeActivityId(), fullName, normalizedStartTime, normalizedEndTime, category, primary?.url || null, primary?.fileName || null, JSON.stringify(photos), leaderName || '', contactPhone || '', 'other_college', organizer, JSON.stringify([{ type: 'other_college', name: organizer }]), auth.user!.id, auth.user!.username, auth.user!.student_id, scoringTableUrl, scoringTableFileName, idempotencyKey],
      )).rows[0] as Record<string, unknown> | undefined;
      if (!data) {
        const existing = (await client.query('SELECT * FROM activities WHERE idempotency_key=$1', [idempotencyKey])).rows[0] as Record<string, unknown> | undefined;
        return { data: existing, created: false };
      }
      await writeAuditLog({ actor: auth.user, action: 'create_other_college_registration', resourceType: 'activity', resourceId: String(data.id), details: { status: '正常活动', scoringStatus: '待赋分', recordPhotoCount: photos.length } }, client);
      return { data, created: true };
    });
    const saved = result.data as (Record<string, unknown> & { scoring_material_submitter_id?: string | null }) | undefined;
    if (!saved) return NextResponse.json({ success: false, error: '提交未完成，请重试' }, { status: 409 });
    if (!result.created && saved.scoring_material_submitter_id !== auth.user!.id && auth.user!.role !== 'admin') {
      return NextResponse.json({ success: false, error: '重复请求标识已被其他用户使用' }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: withActivityWallTime(saved) });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '登记失败' }, { status });
  }
}
