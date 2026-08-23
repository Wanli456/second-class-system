import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { query, queryOne } from '@/storage/database/supabase-client';
import { computeImageHashes } from '@/lib/image-hash';

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
    let auth = await requirePermission(request, 'queryLeave');
    if (auth.response) {
      auth = await requirePermission(request, 'reviewLeave');
      if (auth.response) return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const keyword = searchParams.get('keyword')?.trim();
    const className = searchParams.get('class')?.trim();

    if (id) {
      const original = await queryOne('SELECT * FROM original_leave_slips WHERE id=$1', [id]);
      if (!original) return NextResponse.json({ success: false, error: '原假条不存在' }, { status: 404 });
      return NextResponse.json({ success: true, data: [original] });
    }

    const where: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (keyword) {
      params.push(`%${keyword}%`);
      where.push(`(activity_name ILIKE $${paramIndex} OR class_names ILIKE $${paramIndex} OR student_names ILIKE $${paramIndex++})`);
    }
    if (className) {
      params.push(`%${className}%`);
      where.push(`class_names ILIKE $${paramIndex++}`);
    }

    const data = await query(
      `SELECT * FROM original_leave_slips ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`,
      params,
    );
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

    const body = await request.json();
    const activityId = body.activity_id ? String(body.activity_id).trim() : '';
    const activityName = body.activity_name ? String(body.activity_name).trim() : '';
    const classNames = parseArray(body.class_names);
    const studentNames = parseArray(body.student_names);
    if (!activityId || !activityName) {
      return NextResponse.json({ success: false, error: '原假条一次只能绑定一个活动，请选择系统中已有的活动' }, { status: 400 });
    }

    const startTime = body.start_time ? new Date(String(body.start_time)) : null;
    const endTime = body.end_time ? new Date(String(body.end_time)) : null;
    const images = parseImages(body.images);
    const imageList = images.length ? images : (body.image_url ? [{ url: String(body.image_url), name: String(body.image_name || body.image_url.split('/').pop() || '') }] : []);
    const ocrNames = parseArray(body.ocr_names);
    const imageHashes = await computeImageHashes(imageList.map((item) => item.url));
    const data = await queryOne(
      `INSERT INTO original_leave_slips (activity_id, activity_name, class_names, student_names, start_time, end_time, image_url, image_name, image_list, ocr_names, image_hashes, notes, created_by_user_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [activityId, activityName, JSON.stringify(classNames), JSON.stringify(studentNames), startTime ? startTime.toISOString() : null, endTime ? endTime.toISOString() : null, imageList.length ? imageList[0].url : null, imageList.length ? imageList[0].name : null, JSON.stringify(imageList), JSON.stringify(ocrNames), JSON.stringify(imageHashes), body.notes ? String(body.notes) : null, user.id, user.username],
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('创建原假条失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '创建原假条失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'manageOriginalLeave');
    if (auth.response) return auth.response;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少ID参数' }, { status: 400 });
    await query('DELETE FROM original_leave_slips WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除原假条失败:', error);
    return NextResponse.json({ success: false, error: '删除原假条失败' }, { status: 500 });
  }
}
