import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import { requirePermission, requireUser } from '@/lib/auth';
import { getActivityScopes, hasAnyScopePermission, newActivityId, normalizeScopes, serializeScopes, scopeMatchesUser, validateScopes } from '@/lib/business-rules';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const purpose = searchParams.get('purpose');

    if (purpose === 'leave') {
      const auth = await requireUser(request);
      if (auth.response) return auth.response;
      const keyword = searchParams.get('keyword');
      const params: unknown[] = ['正常活动'];
      let sql = 'SELECT id,full_name FROM activities WHERE status=$1';
      if (keyword) {
        params.push(`%${keyword}%`);
        sql += ` AND full_name ILIKE $${params.length}`;
      }
      sql += ' ORDER BY created_at DESC';
      return NextResponse.json({ success: true, data: await query(sql, params) });
    }

    if (purpose === 'scoring') {
      const auth = await requirePermission(request, 'submitScoring');
      if (auth.response) return auth.response;
      const id = searchParams.get('id');
      const keyword = searchParams.get('keyword');
      const params: unknown[] = [];
      const clauses = ['1=1'];
      if (id) { params.push(id); clauses.push(`id=$${params.length}`); }
      if (keyword) { params.push(`%${keyword}%`); clauses.push(`full_name ILIKE $${params.length}`); }
      const data = await query(
        `SELECT id,full_name,level,category,leader_name,leader_phone,scoring_status,scoring_table_url,scoring_table_file_name,record_file_url,record_file_name,scope_names,scope_type,scope_name FROM activities WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
        params,
      );
      const visible = auth.user!.role === 'admin'
        ? data
        : data.filter((item) => scopeMatchesUser(auth.user!, getActivityScopes(item)));
      return NextResponse.json({ success: true, data: visible });
    }

    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const id = searchParams.get('id');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const level = searchParams.get('level');
    const keyword = searchParams.get('keyword');
    let sql = 'SELECT * FROM activities WHERE 1=1';
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => { sql += ` AND ${clause} $${params.length + 1}`; params.push(value); };
    if (id) add('id =', id);
    if (category) add('category =', category);
    if (status) add('status =', status);
    if (level) add('level =', level);
    if (keyword) add('full_name ILIKE', `%${keyword}%`);
    sql += ' ORDER BY created_at DESC';
    const data = await query(sql, params);
    const visible = auth.user!.role === 'admin' || !auth.user!.can_submit_scoring
      ? data
      : data.filter((item) => scopeMatchesUser(auth.user!, getActivityScopes(item)));
    return NextResponse.json({ success: true, data: visible });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const body = await request.json();
    const { full_name, start_time, end_time, category, level, plan_file_url, plan_file_name, record_file_url, record_file_name, leader_name, leader_phone, status = '正常活动' } = body;
    const scopes = normalizeScopes(body.scope_names, body.scope_type, body.scope_name || auth.user!.department || auth.user!.class_name);
    const validation = validateScopes(scopes);
    if (!full_name || !start_time || !end_time || !category || !level || !leader_name || !leader_phone || !validation.valid) return NextResponse.json({ success: false, error: validation.error || '缺少必填字段或活动所属部门/班级' }, { status: 400 });
    const firstScope = scopes[0];
    const id = newActivityId();
    const data = await queryOne(`INSERT INTO activities (id,full_name,start_time,end_time,category,level,plan_file_url,plan_file_name,record_file_url,record_file_name,leader_name,leader_phone,scope_type,scope_name,scope_names,leader_ids,activity_submitter_id,activity_submitter_name,activity_submitter_student_id,status,scoring_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'待赋分') RETURNING *`, [id, full_name, start_time, end_time, category, level, plan_file_url || null, plan_file_name || null, record_file_url || null, record_file_name || null, leader_name, leader_phone, firstScope.type, firstScope.name, serializeScopes(scopes), JSON.stringify(body.leader_ids || []), auth.user!.id, auth.user!.username, auth.user!.student_id, status]);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '创建失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ success: false, error: '缺少活动ID' }, { status: 400 });
    const materialFields = ['scoring_table_url', 'scoring_table_file_name', 'record_file_url', 'record_file_name'];
    const updateKeys = Object.keys(updates);
    const isScoringMaterialSubmission = updateKeys.length > 0 && updateKeys.every((key) => materialFields.includes(key));
    const auth = await requirePermission(request, isScoringMaterialSubmission ? 'submitScoring' : 'admin');
    if (auth.response) return auth.response;
    if (!updateKeys.length) return NextResponse.json({ success: false, error: '没有可更新的内容' }, { status: 400 });
    const activity = await queryOne('SELECT * FROM activities WHERE id=$1', [id]);
    if (!activity) return NextResponse.json({ success: false, error: '活动不存在' }, { status: 404 });
    if (isScoringMaterialSubmission) {
      if (activity.scoring_status === '已赋分') return NextResponse.json({ success: false, error: '该活动已完成赋分，不能重新提交材料' }, { status: 400 });
      if (!hasAnyScopePermission(auth.user!, 'submitScoring', getActivityScopes(activity))) return NextResponse.json({ success: false, error: '你没有该活动所属部门或班级的赋分材料权限' }, { status: 403 });
      updates.scoring_material_submitter_id = auth.user!.id;
    }
    const allowedFields = ['full_name','start_time','end_time','category','level','plan_file_url','plan_file_name','record_file_url','record_file_name','leader_name','leader_phone','scope_type','scope_name','scope_names','leader_ids','status','scoring_table_url','scoring_table_file_name','scoring_material_submitter_id'];
    const safeKeys = Object.keys(updates).filter((key) => allowedFields.includes(key));
    if (!safeKeys.length) return NextResponse.json({ success: false, error: '没有可更新的内容' }, { status: 400 });
    const params: unknown[] = [];
    const setClauses = safeKeys.map((key) => { params.push(updates[key]); return `${key}=$${params.length}`; });
    params.push(id);
    const data = await queryOne(`UPDATE activities SET ${setClauses.join(',')}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`, params);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '更新失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少活动ID' }, { status: 400 });
    await query('DELETE FROM activities WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '删除失败' }, { status: 500 });
  }
}
