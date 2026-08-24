import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { query, queryOne } from '@/storage/database/supabase-client';

const REVIEW_STATUSES = ['待查对', '已通过', '已驳回'] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'reviewLeave');
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword')?.trim();
    const status = searchParams.get('status')?.trim();
    const slipType = searchParams.get('slip_type')?.trim();
    const className = searchParams.get('class')?.trim();

    const where: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status && REVIEW_STATUSES.includes(status as (typeof REVIEW_STATUSES)[number])) {
      params.push(status);
      where.push(`review_status = $${paramIndex++}`);
    }
    if (slipType) {
      params.push(slipType);
      where.push(`slip_type = $${paramIndex++}`);
    }
    if (className) {
      params.push(`%${className}%`);
      where.push(`class_names ILIKE $${paramIndex++}`);
    }
    if (keyword) {
      params.push(`%${keyword}%`);
      where.push(`(applicant_name ILIKE $${paramIndex} OR applicant_student_id ILIKE $${paramIndex} OR activity_name ILIKE $${paramIndex} OR class_names ILIKE $${paramIndex++})`);
    }

    const slips = await query(
      `SELECT * FROM leave_slips ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY review_status='待查对' DESC, created_at DESC LIMIT 200`,
      params,
    );
    const slipIds = slips.map((slip) => String((slip as { id: string }).id));
    const students = slipIds.length
      ? await query(`SELECT * FROM leave_slip_students WHERE slip_id IN (${slipIds.map((_, index) => `$${index + 1}`).join(',')}) ORDER BY slip_id, student_id`, slipIds)
      : [];

    return NextResponse.json({ success: true, data: slips, students });
  } catch (error) {
    console.error('获取待查对假条失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '获取待查对假条失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'reviewLeave');
    if (auth.response) return auth.response;
    const reviewer = auth.user!;

    const body = await request.json();
    const id = String(body.id || '').trim();
    const reviewStatus = String(body.review_status || '');
    if (!id || !REVIEW_STATUSES.includes(reviewStatus as (typeof REVIEW_STATUSES)[number])) {
      return NextResponse.json({ success: false, error: '缺少或无效的审核参数' }, { status: 400 });
    }

    const slip = await queryOne<{ applicant_user_id: string; review_status: string }>(
      'SELECT applicant_user_id, review_status FROM leave_slips WHERE id=$1',
      [id],
    );
    if (!slip) return NextResponse.json({ success: false, error: '假条不存在' }, { status: 404 });
    if (slip.review_status && slip.review_status !== '待查对') {
      return NextResponse.json({ success: false, error: '假条已处理，请刷新后重试' }, { status: 409 });
    }
    // 管理员和学习竞技部负责人可以查对自己提交的假条（常见于临时请假由其本人代为汇总提交）；
    // 其余人员仍不能自己批自己，避免利益冲突。
    const canSelfReview = reviewer.role === 'admin' || (reviewer.role === 'leader' && reviewer.department === '学习竞技部');
    if (!canSelfReview && slip.applicant_user_id === reviewer.id) {
      return NextResponse.json({ success: false, error: '不能查对自己上传的假条' }, { status: 403 });
    }

    const data = await queryOne(
      `UPDATE leave_slips SET review_status=$1, review_note=$2, reviewed_by_user_id=$3, reviewed_by_name=$4, reviewed_at=NOW(), updated_at=NOW() WHERE id=$5 AND review_status='待查对' RETURNING *`,
      [reviewStatus, body.review_note ? String(body.review_note) : null, reviewer.id, reviewer.username, id],
    );
    if (!data) return NextResponse.json({ success: false, error: '假条状态已变化，请刷新后重试' }, { status: 409 });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('查对假条失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '查对假条失败' }, { status: 500 });
  }
}