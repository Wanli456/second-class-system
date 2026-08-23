import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { calculateUserPermissions, requirePermission, requireUser } from '@/lib/auth';
import { query, queryOne } from '@/storage/database/supabase-client';

const REVIEW_STATUSES = ['待查对', '已通过', '已驳回'] as const;

function parseNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

type ImageInput = { url: string; name?: string };
function parseImages(value: unknown): ImageInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { url?: unknown; name?: unknown };
    const url = String(candidate.url || '').trim();
    if (!url) return [];
    return [{ url, name: String(candidate.name || '').trim() || url.split('/').pop() || '' }];
  });
}

const WEEKDAY_OFFSETS: Record<string, number> = { '星期一': 0, '星期二': 1, '星期三': 2, '星期四': 3, '星期五': 4, '星期六': 5, '星期日': 6 };

function shiftDate(date: string, offsetDays: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  const shifted = new Date(parsed.getTime() + offsetDays * 86400000);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseSchedules(value: unknown): Array<{ date: string; weekday: string; students: string[] }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { weekday?: unknown; students?: unknown; student_names?: unknown };
    const weekday = String(candidate.weekday || '').trim();
    if (!Object.prototype.hasOwnProperty.call(WEEKDAY_OFFSETS, weekday)) return [];
    const students = parseNames(candidate.students ?? candidate.student_names);
    if (!students.length) return [];
    return [{ date: '', weekday, students }];
  });
}

// GET /api/attendance-work?date=YYYY-MM-DD&review_status=已通过（已通过时用于晚自习查询）
// GET /api/attendance-work 返回全部安排（具备上传/查询/查对任一权限）。
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const user = auth.user!;
  const permissions = calculateUserPermissions(user);
  const canList = permissions.canManageAttendanceWork || permissions.canReviewLeave || permissions.canViewEveningStudy || permissions.canQueryLeave;
  if (!canList) return NextResponse.json({ success: false, error: '暂无权限查看考勤工作安排' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date')?.trim() || '';
  const reviewStatus = searchParams.get('review_status')?.trim() || '';
  const conditions: string[] = [];
  const values: (string | null)[] = [];
  let index = 1;
  if (date) {
    conditions.push('start_date <= $1 AND end_date >= $1');
    values.push(date);
    index += 1;
  }
  if (reviewStatus && REVIEW_STATUSES.includes(reviewStatus as (typeof REVIEW_STATUSES)[number])) {
    conditions.push(`review_status = $${index}`);
    values.push(reviewStatus);
  } else if (!reviewStatus && !permissions.canReviewLeave && !permissions.canManageAttendanceWork) {
    // 普通查询/晚自习用户默认只看已通过，避免看到待查对/已驳回内容。
    conditions.push(`review_status = $${index}`);
    values.push('已通过');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(
    `SELECT * FROM attendance_work_arrangements ${where} ORDER BY created_at DESC`,
    values,
  );
  return NextResponse.json({ success: true, data: rows });
}

// POST /api/attendance-work
// body: { name, start_date, end_date, student_names:[], images:[{url,name}] 或 image_list:[url] }
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'manageAttendanceWork');
    if (auth.response) return auth.response;
    const user = auth.user!;

    const body = await request.json();
    const name = String(body.name || '考勤工作安排').trim();
    const weekStartDate = String(body.week_start_date || body.start_date || '').trim();
    const rawSchedules = parseSchedules(body.schedules);
    const legacyStudentNames = parseNames(body.student_names);
    const legacyEndDate = String(body.end_date || '').trim();
    let schedules = rawSchedules;
    if (schedules.length) {
      schedules = schedules.map((item) => ({ ...item, date: shiftDate(weekStartDate, WEEKDAY_OFFSETS[item.weekday] || 0) })).filter((item) => item.date);
      if (!schedules.length) return NextResponse.json({ success: false, error: '周起始日期不正确，无法换算具体日期' }, { status: 400 });
    } else {
      // 兼容旧版整周名单模式：没有按星期分组时，退化为整周统一名单。
      if (legacyStudentNames.length && weekStartDate && legacyEndDate && legacyEndDate >= weekStartDate) {
        schedules = [{ date: weekStartDate, weekday: '星期一', students: legacyStudentNames }];
      } else {
        return NextResponse.json({ success: false, error: '请按星期填写每天考勤人员，或填写姓名与起止日期' }, { status: 400 });
      }
    }

    const allNames = [...new Set(schedules.flatMap((item) => item.students))];
    if (!allNames.length) return NextResponse.json({ success: false, error: '请至少填写一名考勤人员姓名' }, { status: 400 });
    const dates = schedules.map((item) => item.date).sort();
    const startDate = dates[0];
    // 旧版整周名单：保持原始 end_date，避免只生成周一当天。
    const endDate = rawSchedules.length ? dates[dates.length - 1] : (legacyEndDate || startDate);

    const images = parseImages(body.images);
    const fallbackUrl = body.leave_image_url ? String(body.leave_image_url) : (Array.isArray(body.image_list) ? body.image_list[0] : '');
    const imageList = images.length ? images : (fallbackUrl ? [{ url: fallbackUrl, name: String(body.leave_image_name || '考勤表') }] : []);
    if (!imageList.length) return NextResponse.json({ success: false, error: '请上传考勤工作安排表截图' }, { status: 400 });

    const id = `aw-${randomUUID()}`;
    await query(
      `INSERT INTO attendance_work_arrangements (id, name, start_date, end_date, student_names, schedules, image_list, ocr_names, review_status, created_by_user_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'待查对',$9,$10)`,
      [id, name, startDate, endDate, JSON.stringify(allNames), JSON.stringify(schedules), JSON.stringify(imageList), JSON.stringify(allNames), user.id, user.username],
    );

    return NextResponse.json({ success: true, data: { id, review_status: '待查对' } });
  } catch (error) {
    console.error('提交考勤工作安排失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '提交失败' }, { status: 500 });
  }
}

// PUT /api/attendance-work
// 两种用途：
// 1) 查对：body { id, review_status: '已通过' | '已驳回', review_note }
// 2) 修改：body { id, name, week_start_date, schedules, images? }，修改后回到待查对重新查对。
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id || '').trim();
    const reviewStatus = String(body.review_status || '').trim();

    if (reviewStatus) {
      const auth = await requirePermission(request, 'reviewLeave');
      if (auth.response) return auth.response;
      const user = auth.user!;

      if (!id || !REVIEW_STATUSES.includes(reviewStatus as (typeof REVIEW_STATUSES)[number])) {
        return NextResponse.json({ success: false, error: '参数不合法' }, { status: 400 });
      }
      const existing = await queryOne<{ review_status?: string; created_by_user_id?: string | null }>(
        'SELECT review_status, created_by_user_id FROM attendance_work_arrangements WHERE id=$1',
        [id],
      );
      if (!existing) return NextResponse.json({ success: false, error: '考勤工作安排不存在' }, { status: 404 });
      if (existing.created_by_user_id && existing.created_by_user_id === user.id && user.role !== 'admin' && user.role !== 'leader') {
        return NextResponse.json({ success: false, error: '不能查对自己提交的考勤工作安排' }, { status: 403 });
      }
      if (existing.review_status !== '待查对') {
        return NextResponse.json({ success: false, error: '只有待查对的安排可以查对' }, { status: 400 });
      }

      await query(
        `UPDATE attendance_work_arrangements
         SET review_status=$1, review_note=$2, reviewed_by_user_id=$3, reviewed_by_name=$4, reviewed_at=NOW(), updated_at=NOW()
         WHERE id=$5`,
        [reviewStatus, String(body.review_note || '').trim() || null, user.id, user.username, id],
      );

      return NextResponse.json({ success: true, data: { id, review_status: reviewStatus } });
    }

    // 修改模式
    const auth = await requirePermission(request, 'manageAttendanceWork');
    if (auth.response) return auth.response;
    const user = auth.user!;

    const existing = await queryOne<{ created_by_user_id?: string | null; image_list?: string | null }>(
      'SELECT created_by_user_id, image_list FROM attendance_work_arrangements WHERE id=$1',
      [id],
    );
    if (!existing) return NextResponse.json({ success: false, error: '考勤工作安排不存在' }, { status: 404 });
    if (user.role !== 'admin' && user.role !== 'leader' && existing.created_by_user_id && existing.created_by_user_id !== user.id) {
      return NextResponse.json({ success: false, error: '只能修改自己提交的安排' }, { status: 403 });
    }

    const name = String(body.name || '考勤工作安排').trim();
    const weekStartDate = String(body.week_start_date || body.start_date || '').trim();
    const rawSchedules = parseSchedules(body.schedules);
    const legacyStudentNames = parseNames(body.student_names);
    let schedules = rawSchedules;
    if (schedules.length) {
      schedules = schedules.map((item) => ({ ...item, date: shiftDate(weekStartDate, WEEKDAY_OFFSETS[item.weekday] || 0) })).filter((item) => item.date);
      if (!schedules.length) return NextResponse.json({ success: false, error: '周起始日期不正确，无法换算具体日期' }, { status: 400 });
    } else if (legacyStudentNames.length && weekStartDate) {
      schedules = [{ date: weekStartDate, weekday: '星期一', students: legacyStudentNames }];
    } else {
      return NextResponse.json({ success: false, error: '请按星期填写每天考勤人员' }, { status: 400 });
    }

    const allNames = [...new Set(schedules.flatMap((item) => item.students))];
    if (!allNames.length) return NextResponse.json({ success: false, error: '请至少填写一名考勤人员姓名' }, { status: 400 });
    const dates = schedules.map((item) => item.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const images = parseImages(body.images);
    let existingImages: ImageInput[] = [];
    if (existing.image_list) {
      try {
        const parsed = JSON.parse(existing.image_list);
        if (Array.isArray(parsed)) existingImages = parsed;
      } catch {
        existingImages = [];
      }
    }
    const imageList = images.length ? images : existingImages;
    if (!imageList.length) {
      return NextResponse.json({ success: false, error: '请上传考勤工作安排表截图' }, { status: 400 });
    }

    await query(
      `UPDATE attendance_work_arrangements
       SET name=$1, start_date=$2, end_date=$3, student_names=$4, schedules=$5, image_list=$6, ocr_names=$7,
           review_status='待查对', review_note='临时修改，待重新查对', reviewed_by_user_id=NULL, reviewed_by_name=NULL, reviewed_at=NULL, updated_at=NOW()
       WHERE id=$8`,
      [name, startDate, endDate, JSON.stringify(allNames), JSON.stringify(schedules), JSON.stringify(imageList), JSON.stringify(allNames), id],
    );

    return NextResponse.json({ success: true, data: { id, review_status: '待查对' } });
  } catch (error) {
    console.error('操作考勤工作安排失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '操作失败' }, { status: 500 });
  }
}