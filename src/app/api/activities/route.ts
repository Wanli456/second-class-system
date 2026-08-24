import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import { calculateUserPermissions, requirePermission, requireUser } from '@/lib/auth';
import { getActivityScopes, hasAnyScopePermission, newActivityId, normalizeIds, normalizeScopes, serializeScopes, scopeMatchesUser, validateScopes } from '@/lib/business-rules';
import { isValidCategoryPath } from '@/lib/types';
import { hydrateActivityLeaderDetails } from '@/lib/hydrate-activity-leaders';
import { serializeActivityLeaderDetails } from '@/lib/activity-leader-details';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const purpose = searchParams.get('purpose');

    if (purpose === 'leave') {
      const auth = await requireUser(request);
      if (auth.response) return auth.response;
      if (!calculateUserPermissions(auth.user!).canUploadLeave) {
        return NextResponse.json({ success: false, error: '暂无假条上传权限' }, { status: 403 });
      }
      const keyword = searchParams.get('keyword');
      const params: unknown[] = ['正常活动'];
      let sql = 'SELECT id,full_name,scope_type,scope_name,scope_names FROM activities WHERE status=$1';
      if (keyword) {
        params.push(`%${keyword}%`);
        sql += ` AND full_name ILIKE $${params.length}`;
      }
      sql += ' ORDER BY created_at DESC';
      const rows = await query(sql, params);
      // 活动假条由班级负责人代本班提交，活动可能由其他部门主办；
      // 因此活动选择不再受主办范围限制，必须由用户手动选定准确活动。
      return NextResponse.json({ success: true, data: rows.map(({ id, full_name }) => ({ id, full_name })) });
    }

    if (purpose === 'scoring') {
      const auth = await requirePermission(request, 'submitScoring');
      if (auth.response) return auth.response;
      const id = searchParams.get('id');
      const keyword = searchParams.get('keyword');
      const status = searchParams.get('status');
      const level = searchParams.get('level');
      const params: unknown[] = ['正常活动'];
      const clauses = ['status=$1'];
      if (id) { params.push(id); clauses.push(`id=$${params.length}`); }
      if (keyword) { params.push(`%${keyword}%`); clauses.push(`full_name ILIKE $${params.length}`); }
      if (status) { params.push(status); clauses.push(`scoring_status=$${params.length}`); }
      if (level) { params.push(level); clauses.push(`level=$${params.length}`); }
      const data = await query(
      `SELECT id,full_name,start_time,end_time,registration_start_time,registration_end_time,level,category,category_primary,category_secondary,leader_name,leader_phone,leader_ids,leader_details,scoring_status,scoring_table_url,scoring_table_file_name,record_file_url,record_file_name,record_photo_url,record_photo_file_name,scope_names,scope_type,scope_name,activity_submitter_name,activity_submitter_student_id,scoring_material_submitter_name,scoring_material_submitter_student_id FROM activities WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
        params,
      );
      const visible = auth.user!.role === 'admin'
        ? data
        : data.filter((item) => scopeMatchesUser(auth.user!, getActivityScopes(item)));
      return NextResponse.json({ success: true, data: await hydrateActivityLeaderDetails(visible) });
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
    const canSubmitScoring = calculateUserPermissions(auth.user!).canSubmitScoring;
    const visible = auth.user!.role === 'admin' || !canSubmitScoring
      ? data
      : data.filter((item) => scopeMatchesUser(auth.user!, getActivityScopes(item)));
    return NextResponse.json({ success: true, data: await hydrateActivityLeaderDetails(visible) });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const body = await request.json();
    const { full_name, start_time, end_time, registration_start_time, registration_end_time, category, category_primary, category_secondary, level, plan_file_url, plan_file_name, record_file_url, record_file_name, leader_name, leader_phone, status = '正常活动' } = body;
    const scopes = normalizeScopes(body.scope_names, body.scope_type, body.scope_name || auth.user!.department || auth.user!.class_name);
    const validation = validateScopes(scopes);
    if (!full_name || !start_time || !end_time || !registration_start_time || !registration_end_time || !category || !category_primary || !category_secondary || !isValidCategoryPath(category, category_primary, category_secondary) || !level || !leader_name || !leader_phone || !validation.valid) return NextResponse.json({ success: false, error: validation.error || '请填写活动报名时间、活动举办时间、完整二课分类和其他必填信息' }, { status: 400 });
    const firstScope = scopes[0];
    const id = newActivityId();
    const data = await queryOne(`INSERT INTO activities (id,full_name,start_time,end_time,registration_start_time,registration_end_time,category,category_primary,category_secondary,level,plan_file_url,plan_file_name,record_file_url,record_file_name,leader_name,leader_phone,scope_type,scope_name,scope_names,leader_ids,activity_submitter_id,activity_submitter_name,activity_submitter_student_id,status,scoring_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'待赋分') RETURNING *`, [id, full_name, start_time, end_time, registration_start_time, registration_end_time, category, category_primary || null, category_secondary || null, level, plan_file_url || null, plan_file_name || null, record_file_url || null, record_file_name || null, leader_name, leader_phone, firstScope.type, firstScope.name, serializeScopes(scopes), JSON.stringify(body.leader_ids || []), auth.user!.id, auth.user!.username, auth.user!.student_id, status]);
    const leaderIds = normalizeIds(body.leader_ids);
    if (leaderIds.length) {
      const placeholders = leaderIds.map((_, index) => `$${index + 1}`).join(',');
      const leaders = await query<{ id: string; username: string; student_id: string; contact_phone: string | null }>(`SELECT id,username,student_id,contact_phone FROM users WHERE id IN (${placeholders})`, leaderIds);
      await query('UPDATE activities SET leader_details=$1 WHERE id=$2', [serializeActivityLeaderDetails(leaders.map((leader) => ({ id: leader.id, name: leader.username, studentId: leader.student_id, contactPhone: leader.contact_phone || null }))), id]);
    }
    const updated = await queryOne('SELECT * FROM activities WHERE id=$1', [id]);
    return NextResponse.json({ success: true, data: updated || data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '创建失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ success: false, error: '缺少活动ID' }, { status: 400 });
    const materialFields = ['scoring_table_url', 'scoring_table_file_name', 'record_photo_url', 'record_photo_file_name'];
    const updateKeys = Object.keys(updates);
    const isScoringMaterialSubmission = updateKeys.length > 0 && updateKeys.every((key) => materialFields.includes(key));
    const auth = await requirePermission(request, isScoringMaterialSubmission ? 'submitScoring' : 'admin');
    if (auth.response) return auth.response;
    if (!updateKeys.length) return NextResponse.json({ success: false, error: '没有可更新的内容' }, { status: 400 });
    const activity = await queryOne('SELECT * FROM activities WHERE id=$1', [id]);
    if (!activity) return NextResponse.json({ success: false, error: '活动不存在' }, { status: 404 });
    if (isScoringMaterialSubmission) {
      if (activity.status !== '正常活动') return NextResponse.json({ success: false, error: '仅正常活动可以提交赋分材料' }, { status: 400 });
      if (activity.scoring_status === '已赋分') return NextResponse.json({ success: false, error: '该活动已完成赋分，不能重新提交材料' }, { status: 400 });
      if (!hasAnyScopePermission(auth.user!, 'submitScoring', getActivityScopes(activity))) return NextResponse.json({ success: false, error: '你没有该活动所属部门或班级的赋分材料权限' }, { status: 403 });
      if (activity.level === '校级' && !updates.record_photo_url && !activity.record_photo_url) return NextResponse.json({ success: false, error: '校级活动提交赋分材料时必须上传备案表照片' }, { status: 400 });
      updates.scoring_material_submitter_id = auth.user!.id;
      updates.scoring_material_submitter_name = auth.user!.username;
      updates.scoring_material_submitter_student_id = auth.user!.student_id;
    }
    const allowedFields = ['full_name','start_time','end_time','registration_start_time','registration_end_time','category','category_primary','category_secondary','level','plan_file_url','plan_file_name','record_file_url','record_file_name','record_photo_url','record_photo_file_name','leader_name','leader_phone','scope_type','scope_name','scope_names','leader_ids','status','scoring_table_url','scoring_table_file_name','scoring_material_submitter_id','scoring_material_submitter_name','scoring_material_submitter_student_id'];
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
