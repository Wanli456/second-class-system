import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireUser, type AuthUser } from '@/lib/auth';
import { query, queryOne, withTransaction } from '@/storage/database/supabase-client';
import { compareSlipWithOriginals } from '@/lib/leave-slip-matching';
import { computeImageHashes } from '@/lib/image-hash';
import { detectDuplicateSlip } from '@/lib/leave-slip-duplicate';

const SLIP_TYPES = ['手写假条', '二课活动请假', '校级（且不为数经举办）假条', '手机假条'] as const;
const LEAVE_TYPES = ['事假', '病假', '活动公假'] as const;
const REVIEW_STATUSES = ['待查对', '已通过', '已驳回'] as const;

type StudentInput = { student_id: string; student_name: string; class_name: string };

class LeaveSlipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeaveSlipValidationError';
  }
}

function parseStudentInput(value: unknown): StudentInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { student_id?: unknown; student_name?: unknown; class_name?: unknown };
    const studentId = String(candidate.student_id || '').trim();
    const studentName = String(candidate.student_name || '').trim();
    const className = String(candidate.class_name || '').trim();
    if (!studentId || !studentName || !className) return [];
    return [{ student_id: studentId, student_name: studentName, class_name: className }];
  });
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parseStringArray(parsed);
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

type ImageInput = { url: string; name?: string };
function parseImageInputs(value: unknown): ImageInput[] {
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

function classroomCondition(auth: AuthUser) {
  // 学生、班级负责人只能提交本班假条；部门负责人和系统管理员不受限。
  if (auth.role === 'admin' || auth.role === 'leader') return null;
  return auth.class_name;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'uploadLeave');
    if (auth.response) return auth.response;
    const user = auth.user!;

    const body = await request.json();
    const slipType = String(body.slip_type || '');
    const leaveType = String(body.leave_type || (slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条' ? '活动公假' : '事假'));
    if (!SLIP_TYPES.includes(slipType as (typeof SLIP_TYPES)[number])) {
      return NextResponse.json({ success: false, error: '假条类型只能是手写假条、二课活动请假、校级（且不为数经举办）假条或手机假条' }, { status: 400 });
    }
    if (!LEAVE_TYPES.includes(leaveType as (typeof LEAVE_TYPES)[number])) {
      return NextResponse.json({ success: false, error: '请假类型不合法' }, { status: 400 });
    }
    if ((slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条') && leaveType !== '活动公假') {
      return NextResponse.json({ success: false, error: '该假条类型的请假类型只能是“活动公假”' }, { status: 400 });
    }
    if (slipType === '二课活动请假' && (!body.activity_id || !body.activity_name)) {
      return NextResponse.json({ success: false, error: '二课活动假条一次只能关联一个活动，请选择活动' }, { status: 400 });
    }
    // 校级（且不为数经举办）假条不关联系统活动：即使前端误传也强制置空。
    const activityId = slipType === '二课活动请假' ? (body.activity_id ? String(body.activity_id) : null) : null;
    const activityName = slipType === '二课活动请假' ? (body.activity_name ? String(body.activity_name) : null) : null;

    const students = parseStudentInput(body.students) || [];
    const classNames = students.length
      ? [...new Set(students.map((student) => student.class_name))]
      : parseStringArray(body.class_names);

    const allowedClass = classroomCondition(user);
    if (allowedClass && classNames.some((className) => className !== allowedClass)) {
      return NextResponse.json({ success: false, error: `当前账号只能提交本班（${allowedClass}）的假条` }, { status: 403 });
    }

    if (!students.length) {
      return NextResponse.json({ success: false, error: '请假学生至少填写一名，且需要学号、姓名、班级完整' }, { status: 400 });
    }
    // 同一假条内的班级数不超过 15 个，防止把全年级并到一张假条上。
    if (classNames.length > 15) return NextResponse.json({ success: false, error: '一张假条最多覆盖 15 个班级' }, { status: 400 });

    const startTime = body.start_time ? new Date(String(body.start_time)) : null;
    const endTime = body.end_time ? new Date(String(body.end_time)) : null;
    if (startTime && endTime && !Number.isNaN(startTime.getTime()) && !Number.isNaN(endTime.getTime()) && endTime <= startTime) {
      return NextResponse.json({ success: false, error: '结束时间必须晚于开始时间' }, { status: 400 });
    }

    const leaveImageUrl = body.leave_image_url ? String(body.leave_image_url) : null;
    const leaveImageName = body.leave_image_name ? String(body.leave_image_name) : null;
    const images = parseImageInputs(body.images);
    const imageList = images.length ? images : (leaveImageUrl ? [{ url: leaveImageUrl, name: leaveImageName || leaveImageUrl.split('/').pop() || '' }] : []);
    if (!imageList.length) return NextResponse.json({ success: false, error: '请上传假条图片' }, { status: 400 });
    if (slipType === '校级（且不为数经举办）假条' && imageList.length < 2) {
      return NextResponse.json({ success: false, error: '校级（且不为数经举办）假条必须同时上传假条截图和到梦空间“等待活动”手机截图' }, { status: 400 });
    }
    const ocrNames = parseStringArray(body.ocr_names);
    const imageHashes = await computeImageHashes(imageList.map((item) => item.url));

    const counselorSignature = body.counselor_signature === true;
    const officialSeal = body.official_seal === true;
    const teacherSignature = body.teacher_signature === true;

    if (slipType === '手写假条' && !counselorSignature) {
      return NextResponse.json({ success: false, error: '手写假条必须勾选“辅导员签字”' }, { status: 400 });
    }
    if (slipType === '二课活动请假' && (!officialSeal || !teacherSignature)) {
      return NextResponse.json({ success: false, error: '二课活动请假必须勾选“公章”和“老师签字”' }, { status: 400 });
    }

    // 18:30 之后允许上传但自动标记迟到，由查对人决定是否采信。
    const chinaNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const isLate = chinaNow.getUTCHours() > 18 || (chinaNow.getUTCHours() === 18 && chinaNow.getUTCMinutes() > 30);

    const result = await withTransaction(async (client) => {
      const slip = (await client.query(
        `INSERT INTO leave_slips (slip_type, leave_type, class_names, start_time, end_time, activity_id, activity_name, applicant_user_id, applicant_name, applicant_student_id, leave_image_url, leave_image_name, image_list, ocr_names, image_hashes, counselor_signature, official_seal, teacher_signature, is_late, review_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'待查对') RETURNING *`,
        [slipType, leaveType, JSON.stringify(classNames), startTime ? startTime.toISOString() : null, endTime ? endTime.toISOString() : null, activityId, activityName, user.id, user.username, user.student_id, imageList[0].url, imageList[0].name, JSON.stringify(imageList), JSON.stringify(ocrNames), JSON.stringify(imageHashes), counselorSignature, officialSeal, teacherSignature, isLate],
      )).rows[0] as { id: string };

      for (const student of students) {
        await client.query(
          'INSERT INTO leave_slip_students (slip_id, student_id, student_name, class_name) VALUES ($1,$2,$3,$4)',
          [slip.id, student.student_id, student.student_name, student.class_name],
        );
      }
      return slip;
    });

    const isCollectiveActivitySlip = slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条';
    let duplicateCheck: Awaited<ReturnType<typeof detectDuplicateSlip>> | null = null;
    try {
      // 活动类假条是“同一张原活动假条、多个班级各自提交本班名单”，图片相同/相似是正常的，不做 P 图查重。
      if (result?.id && !isCollectiveActivitySlip) {
        duplicateCheck = await detectDuplicateSlip(String(result.id), imageHashes);
      }
    } catch (duplicateError) {
      console.error('假条图片查重失败:', duplicateError);
    }

    let autoMatch = null;
    try {
      if (result?.id) autoMatch = await compareSlipWithOriginals(String(result.id));
    } catch (matchError) {
      console.error('假条自动比对失败:', matchError);
    }

    const warnings = isLate ? ['上传时间已超过 18:30，已标记为迟到假条'] : [];
    if (duplicateCheck?.found && duplicateCheck.warning) warnings.push(duplicateCheck.warning);

    return NextResponse.json({
      success: true,
      data: result,
      auto_match: autoMatch,
      duplicate_check: duplicateCheck,
      warnings,
    });
  } catch (error) {
    if (error instanceof LeaveSlipValidationError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    console.error('提交假条失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '提交假条失败' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const selfOnly = searchParams.get('self') === '1';

    let auth = await requirePermission(request, 'queryLeave');
    let canQueryAll = !auth.response;
    if (!canQueryAll) {
      // 晚自习考勤查询沿用旧入口，允许拥有晚自习查询权限的人读取。
      auth = await requirePermission(request, 'eveningStudy');
      canQueryAll = !auth.response;
    }
    if (!canQueryAll) {
      auth = await requireUser(request);
      if (auth.response) return auth.response;
      if (!selfOnly) {
        return NextResponse.json({ success: false, error: '没有假条查询权限' }, { status: 403 });
      }
    }
    const user = auth.user!;

    const id = searchParams.get('id');
    const keyword = searchParams.get('keyword')?.trim();
    const className = searchParams.get('class')?.trim();
    const slipType = searchParams.get('slip_type');
    const leaveType = searchParams.get('leave_type');
    const reviewStatus = searchParams.get('status');
    const originalSlipId = searchParams.get('original_slip_id');
    const date = searchParams.get('date');

    if (id) {
      const slip = canQueryAll
        ? await queryOne('SELECT * FROM leave_slips WHERE id=$1', [id])
        : await queryOne(
            `SELECT * FROM leave_slips WHERE id=$1 AND (
              applicant_user_id=$2 OR applicant_student_id=$3
              OR id IN (SELECT slip_id FROM leave_slip_students WHERE student_id=$4)
            )`,
            [id, user.id, user.student_id, user.student_id],
          );
      if (!slip) return NextResponse.json({ success: false, error: selfOnly ? '没有找到与你相关的假条' : '假条不存在' }, { status: 404 });
      const students = await query('SELECT * FROM leave_slip_students WHERE slip_id=$1 ORDER BY student_id', [id]);
      return NextResponse.json({ success: true, data: [slip], students });
    }

    const where: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (keyword) {
      params.push(`%${keyword}%`);
      where.push(`(applicant_name ILIKE $${paramIndex} OR applicant_student_id ILIKE $${paramIndex} OR activity_name ILIKE $${paramIndex} OR class_names ILIKE $${paramIndex++})`);
    }
    if (className) {
      params.push(`%${className}%`);
      where.push(`class_names ILIKE $${paramIndex++}`);
    }
    if (slipType) {
      params.push(slipType);
      where.push(`slip_type = $${paramIndex++}`);
    }
    if (leaveType) {
      params.push(leaveType);
      where.push(`leave_type = $${paramIndex++}`);
    }
    if (reviewStatus && REVIEW_STATUSES.includes(reviewStatus as (typeof REVIEW_STATUSES)[number])) {
      params.push(reviewStatus);
      where.push(`review_status = $${paramIndex++}`);
    }
    if (originalSlipId) {
      params.push(originalSlipId);
      where.push(`original_slip_id = $${paramIndex++}`);
    }
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      params.push(`${date}%`);
      where.push(`(start_time::text LIKE $${paramIndex} OR created_at::text LIKE $${paramIndex++})`);
    }

    if (!canQueryAll) {
      // 普通学生/班级负责人：默认只能查看与自己相关的假条（本人是上传人或被覆盖学生之一）。
      params.push(user.id, user.student_id, user.student_id);
      where.push(`(applicant_user_id = $${paramIndex} OR applicant_student_id = $${paramIndex + 1} OR id IN (SELECT slip_id FROM leave_slip_students WHERE student_id = $${paramIndex + 2}))`);
      paramIndex += 3;
    }

    const sql = `SELECT * FROM leave_slips ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`;
    const slips = await query(sql, params);
    const slipIds = slips.map((slip) => String((slip as { id: string }).id));
    const students = slipIds.length
      ? await query(`SELECT * FROM leave_slip_students WHERE slip_id IN (${slipIds.map((_, index) => `$${index + 1}`).join(',')}) ORDER BY slip_id, student_id`, slipIds)
      : [];

    return NextResponse.json({ success: true, data: slips, students, count: slips.length });
  } catch (error) {
    console.error('查询假条失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '查询假条失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'manageOriginalLeave');
    if (auth.response) return auth.response;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少ID参数' }, { status: 400 });
    await query('DELETE FROM leave_slip_students WHERE slip_id=$1', [id]);
    await query('DELETE FROM leave_slips WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除假条失败:', error);
    return NextResponse.json({ success: false, error: '删除假条失败' }, { status: 500 });
  }
}