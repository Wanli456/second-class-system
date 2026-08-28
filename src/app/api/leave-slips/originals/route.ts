import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { query, queryOne, withTransaction, withWallTime, withWallTimes } from '@/storage/database/supabase-client';
import { computeImageHashes } from '@/lib/image-hash';
import { normalizeDateTimeInput } from '@/lib/datetime';
import { readIdempotencyKey } from '@/lib/idempotency';

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      return parseArray(JSON.parse(value));
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

type ImageInput = { url: string; name?: string };
function parseImages(value: unknown): ImageInput[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const candidate = item as { url?: unknown; name?: unknown };
      const url = String(candidate.url || '').trim();
      if (!url) return [];
      return [{ url, name: String(candidate.name || '').trim() || url.split('/').pop() || '' }];
    });
  }
  return [];
}

export async function GET(request: NextRequest) {
  try {
    let auth = await requirePermission(request, 'manageOriginalLeave');
    if (auth.response) auth = await requirePermission(request, 'reviewLeave');
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    const ids = [...new Set((searchParams.get('ids') || '').split(',').map((value) => value.trim()).filter(Boolean))];
    const requestedIds = id ? [id] : ids;
    if (requestedIds.length > 100) return NextResponse.json({ success: false, error: '一次最多查询 100 条原假条' }, { status: 400 });
    const keyword = searchParams.get('keyword')?.trim();
    const className = searchParams.get('class')?.trim();

    const where: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (requestedIds.length) {
      params.push(...requestedIds);
      where.push(`id IN (${requestedIds.map((_, index) => `$${paramIndex + index}`).join(',')})`);
      paramIndex += requestedIds.length;
    }

    if (keyword) {
      params.push(`%${keyword}%`);
      where.push(`(activity_name ILIKE $${paramIndex} OR class_names ILIKE $${paramIndex} OR student_names ILIKE $${paramIndex++})`);
    }
    if (className) {
      params.push(`%${className}%`);
      where.push(`class_names ILIKE $${paramIndex++}`);
    }

    const data = withWallTimes(await query(
      `SELECT * FROM original_leave_slips ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`,
      params,
    ));
    if (id && !data.length) return NextResponse.json({ success: false, error: '原假条不存在' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('查询原假条失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '查询原假条失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'submitOriginalLeave');
    if (auth.response) return auth.response;
    const user = auth.user!;
    const idempotencyKey = readIdempotencyKey(request.headers);
    if (!idempotencyKey) return NextResponse.json({ success: false, error: '缺少或无效的幂等请求标识' }, { status: 400 });

    const body = await request.json();
    const repeated = await queryOne<Record<string, unknown>>('SELECT * FROM original_leave_slips WHERE idempotency_key=$1', [idempotencyKey]);
    if (repeated) {
      if (repeated.created_by_user_id !== user.id && user.role !== 'admin') return NextResponse.json({ success: false, error: '重复请求标识已被其他用户使用' }, { status: 409 });
      return NextResponse.json({ success: true, data: withWallTime(repeated) });
    }
    const activityId = body.activity_id ? String(body.activity_id).trim() : '';
    const activityName = body.activity_name ? String(body.activity_name).trim() : '';
    const classNames = parseArray(body.class_names);
    const studentNames = parseArray(body.student_names);
    if (!activityId || !activityName) {
      return NextResponse.json({ success: false, error: '原假条一次只能绑定一个活动，请选择系统中已有的活动' }, { status: 400 });
    }
    const activity = await queryOne<{ id: string; full_name: string }>('SELECT id, full_name FROM activities WHERE id=$1', [activityId]);
    if (!activity) return NextResponse.json({ success: false, error: '活动不存在或已删除，请重新选择活动' }, { status: 400 });
    if (activity.full_name !== activityName) return NextResponse.json({ success: false, error: '活动名称与活动 ID 不一致，请重新选择活动' }, { status: 400 });

    // 原假条起止时间同样按本地墙钟字符串入库，与普通假条保持同一约定。
    const startTime = normalizeDateTimeInput(body.start_time);
    const endTime = normalizeDateTimeInput(body.end_time);
    const images = parseImages(body.images);
    const imageList = images.length ? images : (body.image_url ? [{ url: String(body.image_url), name: String(body.image_name || body.image_url.split('/').pop() || '') }] : []);
    if (!classNames.length || !studentNames.length || !startTime || !endTime || !imageList.length) {
      return NextResponse.json({ success: false, error: '原假条必须填写学生、起止时间并上传图片' }, { status: 400 });
    }
    if (endTime <= startTime) return NextResponse.json({ success: false, error: '结束时间必须晚于开始时间' }, { status: 400 });
    const ocrNames = parseArray(body.ocr_names);
    const imageHashes = await computeImageHashes(imageList.map((item) => item.url));
    const data = await queryOne(
      `INSERT INTO original_leave_slips (activity_id, activity_name, class_names, student_names, start_time, end_time, image_url, image_name, image_list, ocr_names, image_hashes, notes, created_by_user_id, created_by_name, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [activity.id, activity.full_name, JSON.stringify(classNames), JSON.stringify(studentNames), startTime, endTime, imageList[0].url, imageList[0].name, JSON.stringify(imageList), JSON.stringify(ocrNames), JSON.stringify(imageHashes), body.notes ? String(body.notes) : null, user.id, user.username, idempotencyKey],
    );
    if (data) return NextResponse.json({ success: true, data: withWallTime(data) });
    const repeatedAfterRace = await queryOne<Record<string, unknown>>('SELECT * FROM original_leave_slips WHERE idempotency_key=$1', [idempotencyKey]);
    if (!repeatedAfterRace) return NextResponse.json({ success: false, error: '提交未完成，请重试' }, { status: 409 });
    if (repeatedAfterRace.created_by_user_id !== user.id && user.role !== 'admin') return NextResponse.json({ success: false, error: '重复请求标识已被其他用户使用' }, { status: 409 });
    return NextResponse.json({ success: true, data: withWallTime(repeatedAfterRace) });
  } catch (error) {
    console.error('创建原假条失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '创建原假条失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'manageOriginalLeave');
    if (auth.response) return auth.response;
    const user = auth.user!;
    if (user.role !== 'admin' && !(user.role === 'leader' && user.department === '学习竞技部')) {
      return NextResponse.json({ success: false, error: '仅管理员或学习竞技部部门负责人可以删除原假条' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少ID参数' }, { status: 400 });
    const referenced = await queryOne('SELECT 1 FROM leave_slips WHERE original_slip_id=$1 LIMIT 1', [id]);
    if (referenced) {
      return NextResponse.json({ success: false, error: '该原假条已关联班级负责人提交的假条，请先解除关联或重新查对后再删除' }, { status: 409 });
    }
    await withTransaction(async (client) => {
      const locked = await client.query('SELECT 1 FROM leave_slips WHERE original_slip_id=$1 LIMIT 1', [id]);
      if (locked.rows.length) throw new Error('原假条删除时发现新增关联，请稍后重试');
      await client.query('DELETE FROM original_leave_slips WHERE id=$1', [id]);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除原假条失败:', error);
    return NextResponse.json({ success: false, error: '删除原假条失败' }, { status: 500 });
  }
}
