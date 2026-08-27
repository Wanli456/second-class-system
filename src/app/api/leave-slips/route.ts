import { getDayRangeForBusinessDate } from '@/lib/business-time';
import { NextRequest, NextResponse } from 'next/server';
import { calculateUserPermissions, requireUser, type AuthUser } from '@/lib/auth';
import { query, queryOne, withTransaction, withWallTime, withWallTimes } from '@/storage/database/supabase-client';
import { compareSlipWithOriginals } from '@/lib/leave-slip-matching';
import { computeImageHashes } from '@/lib/image-hash';
import { detectDuplicateSlip } from '@/lib/leave-slip-duplicate';
import { normalizeDateTimeInput } from '@/lib/datetime';

const SLIP_TYPES = ['手写假条', '二课活动请假', '校级（且不为数经举办）假条', '手机假条', '其他请假'] as const;
const LEAVE_TYPES = ['事假', '病假', '活动公假'] as const;
const OTHER_LEAVE_TYPES = ['社团', '比赛', '培训', '虚拟工作室', '临时请假'] as const;
const REVIEW_STATUSES = ['待查对', '已通过', '已驳回'] as const;

type StudentInput = { student_id: string; student_name: string; class_name: string };
type StudentParseResult = { students: StudentInput[]; incompleteRows: number[] };

function withoutInternalReviewFields(slip: Record<string, unknown>): Record<string, unknown> {
  const {
    image_hashes: _imageHashes,
    duplicate_of_slip_id: _duplicateOfSlipId,
    duplicate_score: _duplicateScore,
    duplicate_warning: _duplicateWarning,
    original_image_similarity: _originalImageSimilarity,
    original_image_difference_warning: _originalImageDifferenceWarning,
    ...visibleSlip
  } = slip;
  return visibleSlip;
}

class LeaveSlipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeaveSlipValidationError';
  }
}

function parseStudentInput(value: unknown): StudentParseResult {
  if (!Array.isArray(value)) return { students: [], incompleteRows: [] };
  const students: StudentInput[] = [];
  const incompleteRows: number[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      incompleteRows.push(index + 1);
      return;
    }
    const candidate = item as { student_id?: unknown; student_name?: unknown; class_name?: unknown };
    const studentId = String(candidate.student_id || '').trim();
    const studentName = String(candidate.student_name || '').trim();
    const className = String(candidate.class_name || '').trim();
    if (!studentId || !studentName || !className) {
      incompleteRows.push(index + 1);
      return;
    }
    students.push({ student_id: studentId, student_name: studentName, class_name: className });
  });
  return { students, incompleteRows };
}

function validateStudentIdentityPairs(students: StudentInput[]): string | null {
  const identitiesByStudentId = new Map<string, string>();
  const studentIdsByIdentity = new Map<string, string>();
  for (const student of students) {
    const identity = student.student_name + "\u0000" + student.class_name;
    const previousIdentity = identitiesByStudentId.get(student.student_id);
    if (previousIdentity && previousIdentity !== identity) return "学号 " + student.student_id + " 对应了不同的姓名或班级，请核对后再提交";
    const previousStudentId = studentIdsByIdentity.get(identity);
    if (previousStudentId && previousStudentId !== student.student_id) return "学生 " + student.student_name + "（" + student.class_name + "）对应了不同的学号，请核对后再提交";
    identitiesByStudentId.set(student.student_id, identity);
    studentIdsByIdentity.set(identity, student.student_id);
  }
  return null;
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
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const user = auth.user!;

    const body = await request.json();
    const slipType = String(body.slip_type || '');
    const normalizedSlipType = slipType;
    const defaultLeaveType = (slipType === '其他请假' ? '社团' : slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条' ? '活动公假' : '事假');
    const leaveType = String(body.leave_type || defaultLeaveType);
    const isTemporaryLeave = slipType === '其他请假' && leaveType === '临时请假';
    const permissions = calculateUserPermissions(user);
    if (!(isTemporaryLeave ? permissions.canStartGroupLeave : permissions.canUploadLeave)) {
      return NextResponse.json(
        { success: false, error: isTemporaryLeave ? '暂无临时请假提交权限' : '暂无假条上传权限' },
        { status: 403 },
      );
    }
    if (!SLIP_TYPES.includes(normalizedSlipType as (typeof SLIP_TYPES)[number])) {
      return NextResponse.json({ success: false, error: '假条类型只能是手写假条、二课活动请假、校级（且不为数经举办）假条、手机假条或其他请假' }, { status: 400 });
    }
    if (normalizedSlipType === '其他请假') {
      if (!OTHER_LEAVE_TYPES.includes(leaveType as (typeof OTHER_LEAVE_TYPES)[number])) {
        return NextResponse.json({ success: false, error: '其他请假的请假类型只能是社团、比赛、培训、虚拟工作室或临时请假' }, { status: 400 });
      }
    } else if (!LEAVE_TYPES.includes(leaveType as (typeof LEAVE_TYPES)[number])) {
      return NextResponse.json({ success: false, error: '请假类型不合法' }, { status: 400 });
    }
    if ((normalizedSlipType === '二课活动请假' || normalizedSlipType === '校级（且不为数经举办）假条') && leaveType !== '活动公假') {
      return NextResponse.json({ success: false, error: '该假条类型的请假类型只能是“活动公假”' }, { status: 400 });
    }
    if (slipType === '二课活动请假' && (!body.activity_id || !body.activity_name)) {
      return NextResponse.json({ success: false, error: '二课活动假条一次只能关联一个活动，请选择活动' }, { status: 400 });
    }
    // 校级（且不为数经举办）假条不关联系统活动：即使前端误传也强制置空。
    const requestedActivityId = slipType === '二课活动请假' ? (body.activity_id ? String(body.activity_id).trim() : null) : null;
    const requestedActivityName = slipType === '二课活动请假' ? (body.activity_name ? String(body.activity_name).trim() : null) : null;
    let activityId: string | null = null;
    let activityName: string | null = null;
    if (requestedActivityId) {
      const activity = await queryOne<{ id: string; full_name: string }>('SELECT id, full_name FROM activities WHERE id=$1', [requestedActivityId]);
      if (!activity) return NextResponse.json({ success: false, error: '活动不存在或已删除，请重新选择活动' }, { status: 400 });
      if (requestedActivityName !== activity.full_name) {
        return NextResponse.json({ success: false, error: '活动名称与活动 ID 不一致，请重新选择活动' }, { status: 400 });
      }
      activityId = activity.id;
      activityName = activity.full_name;
    }

    const parsedStudents = parseStudentInput(body.students);
    const { students } = parsedStudents;
    const classNames = students.length
      ? [...new Set(students.map((student) => student.class_name))]
      : parseStringArray(body.class_names);

    // 临时请假由获授权人员代为汇总，学生名单可跨班；其余假条仍保持原有班级范围限制。
    const allowedClass = isTemporaryLeave ? null : classroomCondition(user);
    if (allowedClass && classNames.some((className) => className !== allowedClass)) {
      return NextResponse.json({ success: false, error: `当前账号只能提交本班（${allowedClass}）的假条` }, { status: 403 });
    }

    if (!students.length) {
      return NextResponse.json({ success: false, error: '请假学生至少填写一名，且需要学号、姓名、班级完整' }, { status: 400 });
    }
    if (parsedStudents.incompleteRows.length) {
      return NextResponse.json({ success: false, error: `第 ${parsedStudents.incompleteRows.join('、')} 行的学号、姓名或班级不完整，请人工补齐后再提交` }, { status: 400 });
    }
    const studentIdentityError = validateStudentIdentityPairs(students);
    if (studentIdentityError) return NextResponse.json({ success: false, error: studentIdentityError }, { status: 400 });
    // 临时请假名单也必须命中花名册三字段核验：跨班汇总不代表可以免核验，
    // 否则任何拿到 canStartGroupLeave 权限的账号都能伪造任意学生的请假记录。
    {
      const rosterRows = await query<{ student_id: string; student_name: string; class_name: string }>('SELECT student_id, student_name, class_name FROM class_roster WHERE student_id = ANY($1::text[])', [students.map((student) => student.student_id)]);
      const rosterByStudentId = new Map(rosterRows.map((row) => [row.student_id, row]));
      const mismatches = students.filter((student) => {
        const roster = rosterByStudentId.get(student.student_id);
        return !roster || roster.student_name !== student.student_name || roster.class_name !== student.class_name;
      });
      if (mismatches.length) {
        return NextResponse.json({ success: false, error: `花名册未找到或三字段不一致：${mismatches.map((student) => `${student.student_id}（${student.student_name}/${student.class_name}）`).join('、')}` }, { status: 400 });
      }
    }
    // 同一假条内的班级数不超过 15 个，防止把全年级并到一张假条上。
    if (classNames.length > 15) return NextResponse.json({ success: false, error: '一张假条最多覆盖 15 个班级' }, { status: 400 });

    // 起止时间按「本地墙钟」字符串入库（YYYY-MM-DDTHH:mm:ss），同格式可按字典序比较先后。
    const startTime = normalizeDateTimeInput(body.start_time);
    const endTime = normalizeDateTimeInput(body.end_time);
    if (endTime && startTime && endTime <= startTime) {
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

    // 临时请假曾经免审自动通过，但花名册以外没有任何人工核实环节，可被用来伪造他人请假记录；
    // 现在统一走待查对，由学习竞技部负责人或管理员人工查对（提交人不能查对自己提交的记录）。
    const initialReviewStatus = '待查对';

    const result = await withTransaction(async (client) => {
      const slip = (await client.query(
        `INSERT INTO leave_slips (slip_type, leave_type, class_names, start_time, end_time, activity_id, activity_name, applicant_user_id, applicant_name, applicant_student_id, leave_image_url, leave_image_name, image_list, ocr_names, image_hashes, counselor_signature, official_seal, teacher_signature, is_late, review_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
        [slipType, leaveType, JSON.stringify(classNames), startTime, endTime, activityId, activityName, user.id, user.username, user.student_id, imageList[0].url, imageList[0].name, JSON.stringify(imageList), JSON.stringify(ocrNames), JSON.stringify(imageHashes), counselorSignature, officialSeal, teacherSignature, isLate, initialReviewStatus],
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

    return NextResponse.json({
      success: true,
      data: withWallTime(result),
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

    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const user = auth.user!;
    const permissions = calculateUserPermissions(user);
    // 假条查看和假条对比权限可读取各自页面所需的材料；假条查对权限不包含查看或对比权限。
    // 仅无上述权限的普通用户才被限制为查看本人相关记录。
    const canQueryAll = permissions.canQueryLeave || permissions.canManageOriginalLeave;
    if (!canQueryAll && !selfOnly) {
      return NextResponse.json({ success: false, error: '没有查看假条的权限' }, { status: 403 });
    }
    const canReviewInternalSignals = permissions.canReviewLeave;

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
      // 普通学生只能看自己在该假条中的明细，不能借多人假条读取其他学生信息。
      const students = canQueryAll
        ? await query('SELECT * FROM leave_slip_students WHERE slip_id=$1 ORDER BY student_id', [id])
        : await query('SELECT * FROM leave_slip_students WHERE slip_id=$1 AND student_id=$2 ORDER BY student_id', [id, user.student_id]);
      return NextResponse.json({ success: true, data: [withWallTime(canReviewInternalSignals ? slip : withoutInternalReviewFields(slip))], students });
    }

    const where: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (keyword) {
      params.push(`%${keyword}%`);
      where.push(`(applicant_name ILIKE $${paramIndex} OR applicant_student_id ILIKE $${paramIndex} OR activity_name ILIKE $${paramIndex} OR class_names ILIKE $${paramIndex} OR EXISTS (SELECT 1 FROM leave_slip_students AS keyword_students WHERE keyword_students.slip_id=leave_slips.id AND (keyword_students.student_name ILIKE $${paramIndex} OR keyword_students.student_id ILIKE $${paramIndex})))`);
      paramIndex += 1;
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
      const { start, end } = getDayRangeForBusinessDate(date);
      params.push(start, end);
      where.push(`(start_time >= $${paramIndex} AND start_time < $${paramIndex + 1} OR created_at >= $${paramIndex} AND created_at < $${paramIndex + 1})`);
      paramIndex += 2;
    }

    if (!canQueryAll) {
      // 普通学生/班级负责人：默认只能查看与自己相关的假条（本人是上传人或被覆盖学生之一）。
      params.push(user.id, user.student_id, user.student_id);
      where.push(`(applicant_user_id = $${paramIndex} OR applicant_student_id = $${paramIndex + 1} OR id IN (SELECT slip_id FROM leave_slip_students WHERE student_id = $${paramIndex + 2}))`);
      paramIndex += 3;
    }

    const sql = `SELECT * FROM leave_slips ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`;
    const slips = withWallTimes(await query(sql, params));
    const slipIds = slips.map((slip) => String((slip as { id: string }).id));
    const students = slipIds.length
      ? canQueryAll
        ? await query(`SELECT * FROM leave_slip_students WHERE slip_id IN (${slipIds.map((_, index) => `$${index + 1}`).join(',')}) ORDER BY slip_id, student_id`, slipIds)
        : await query(`SELECT * FROM leave_slip_students WHERE slip_id IN (${slipIds.map((_, index) => `$${index + 1}`).join(',')}) AND student_id=$${slipIds.length + 1} ORDER BY slip_id, student_id`, [...slipIds, user.student_id])
      : [];

    const visibleSlips = canReviewInternalSignals ? slips : slips.map(withoutInternalReviewFields);
    return NextResponse.json({ success: true, data: visibleSlips, students, count: slips.length });
  } catch (error) {
    console.error('查询假条失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '查询假条失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const user = auth.user!;
    const canManage = user.role === 'admin' || (user.role === 'leader' && user.department === '学习竞技部');
    if (!canManage) {
      return NextResponse.json({ success: false, error: '仅管理员或学习竞技部部门负责人可以删除普通假条' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少ID参数' }, { status: 400 });
    await withTransaction(async (client) => {
      await client.query('DELETE FROM leave_slip_students WHERE slip_id=$1', [id]);
      await client.query('DELETE FROM leave_slips WHERE id=$1', [id]);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除假条失败:', error);
    return NextResponse.json({ success: false, error: '删除假条失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response) return auth.response;
    const user = auth.user!;
    const canManage = user.role === 'admin' || (user.role === 'leader' && user.department === '学习竞技部');
    if (!canManage) return NextResponse.json({ success: false, error: '仅管理员或学习竞技部部门负责人可以修改普通假条' }, { status: 403 });

    const body = await request.json();
    const id = String(body.id || '').trim();
    const leaveType = String(body.leave_type || '').trim();
    const startTime = normalizeDateTimeInput(body.start_time);
    const endTime = normalizeDateTimeInput(body.end_time);
    if (!id || !leaveType || !startTime || !endTime) {
      return NextResponse.json({ success: false, error: '请完整填写请假类型、开始时间和结束时间' }, { status: 400 });
    }
    if (endTime <= startTime) return NextResponse.json({ success: false, error: '结束时间必须晚于开始时间' }, { status: 400 });

    const current = await queryOne<{ id: string; slip_type: string; counselor_signature: boolean; official_seal: boolean; teacher_signature: boolean; review_status: string }>(
      'SELECT id, slip_type, counselor_signature, official_seal, teacher_signature, review_status FROM leave_slips WHERE id=$1',
      [id],
    );
    if (!current) return NextResponse.json({ success: false, error: '假条不存在或已删除' }, { status: 404 });
    const validLeaveType = current.slip_type === '其他请假'
      ? OTHER_LEAVE_TYPES.includes(leaveType as (typeof OTHER_LEAVE_TYPES)[number])
      : LEAVE_TYPES.includes(leaveType as (typeof LEAVE_TYPES)[number]);
    if (!validLeaveType) return NextResponse.json({ success: false, error: '该假条类型不能使用此请假类型' }, { status: 400 });
    if (current.slip_type === '二课活动请假' && leaveType !== '活动公假') {
      return NextResponse.json({ success: false, error: '二课活动请假只能使用“活动公假”' }, { status: 400 });
    }
    if (current.slip_type === '校级（且不为数经举办）假条' && leaveType !== '活动公假') {
      return NextResponse.json({ success: false, error: '校级（且不为数经举办）假条只能使用“活动公假”' }, { status: 400 });
    }
    if (current.slip_type === '手写假条' && !current.counselor_signature) {
      return NextResponse.json({ success: false, error: '手写假条缺少“辅导员签字”确认，不能修改后重新提交' }, { status: 400 });
    }
    if (current.slip_type === '二课活动请假' && (!current.official_seal || !current.teacher_signature)) {
      return NextResponse.json({ success: false, error: '二课活动请假缺少“公章”或“老师签字”确认，不能修改后重新提交' }, { status: 400 });
    }

    let activityId: string | null = null;
    let activityName: string | null = null;
    if (current.slip_type === '二课活动请假') {
      const requestedActivityId = body.activity_id ? String(body.activity_id).trim() : '';
      if (!requestedActivityId) return NextResponse.json({ success: false, error: '二课活动请假必须关联活动总表中的活动' }, { status: 400 });
      const activity = await queryOne<{ id: string; full_name: string }>('SELECT id, full_name FROM activities WHERE id=$1', [requestedActivityId]);
      if (!activity) return NextResponse.json({ success: false, error: '选择的活动不存在或已删除，请重新选择' }, { status: 400 });
      activityId = activity.id;
      activityName = activity.full_name;
    }

    // 学生名单在此页面只读，因此班级字段只能由现有学生明细生成，禁止请求体把两者改成不一致。
    const studentRows = await query<{ class_name: string }>('SELECT class_name FROM leave_slip_students WHERE slip_id=$1 ORDER BY class_name', [id]);
    if (!studentRows.length) return NextResponse.json({ success: false, error: '该假条没有学生明细，不能修改；请重新提交假条' }, { status: 400 });
    const classNames = [...new Set(studentRows.map((student) => student.class_name.trim()).filter(Boolean))];
    if (!classNames.length) return NextResponse.json({ success: false, error: '该假条学生明细缺少班级，不能修改；请重新提交假条' }, { status: 400 });

    // 用乐观锁（WHERE review_status=读取时的状态）避免覆盖并发查对结果：如果查对人在
    // 读取校验和这次写入之间已经查对过该假条，这里必须失败并提示刷新，而不是静默改回待查对。
    const updated = await queryOne(
      "UPDATE leave_slips SET activity_id=$1, activity_name=$2, class_names=$3, leave_type=$4, start_time=$5, end_time=$6, original_slip_id=NULL, review_status='待查对', review_note=NULL, reviewed_by_user_id=NULL, reviewed_by_name=NULL, reviewed_at=NULL WHERE id=$7 AND review_status=$8 RETURNING *",
      [activityId, activityName || null, JSON.stringify(classNames), leaveType, startTime, endTime, id, current.review_status],
    );
    if (!updated) return NextResponse.json({ success: false, error: '假条状态已被其他操作更新，请刷新后重试' }, { status: 409 });
    return NextResponse.json({ success: true, data: withWallTime(updated), message: '假条已修改，已解除原对比关联并回到待查对' });
  } catch (error) {
    console.error('修改假条失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '修改假条失败' }, { status: 500 });
  }
}
