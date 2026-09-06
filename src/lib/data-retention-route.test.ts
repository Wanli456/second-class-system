import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/data-retention/route';
import { createSessionToken, issueSessionToken } from '@/lib/auth';
import {
  disposeRegisteredUser,
  anonymizedStudentId,
  previewDataRetention,
  runDataRetention,
  utcCalendarYearDeadline,
} from '@/lib/data-retention';
import { ensureDatabaseSchema, query, queryOne } from '@/storage/database/supabase-client';

let adminSessionToken: string | undefined;

function request(body?: Record<string, unknown>, userId?: string) {
  return new NextRequest('http://localhost/api/admin/data-retention', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { Authorization: `Bearer ${userId === 'local-admin' ? adminSessionToken : createSessionToken(userId)}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function run() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PGDATABASE_URL, '');
  await ensureDatabaseSchema();
  adminSessionToken = await issueSessionToken('local-admin');

  assert.equal((await POST(request())).status, 401);
  assert.equal((await POST(request({}, 'local-student'))).status, 403);
  assert.equal((await POST(request({ confirm: true }))).status, 401);
  assert.equal((await POST(request({ confirm: true }, 'local-leader'))).status, 403);

  const invalidJson = new NextRequest('http://localhost/api/admin/data-retention', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSessionToken}` },
    body: '{',
  });
  assert.equal((await POST(invalidJson)).status, 400);

  assert.equal(utcCalendarYearDeadline(new Date('2020-02-29T12:00:00.000Z'), 4).toISOString(), '2024-02-29T12:00:00.000Z');
  assert.equal(utcCalendarYearDeadline(new Date('2096-02-29T12:00:00.000Z'), 4).toISOString(), '2100-02-28T12:00:00.000Z');
  const anonymizedId = anonymizedStudentId('retention-record-with-a-long-id');
  assert.ok(anonymizedId.length <= 20);
  assert.equal(anonymizedId.includes('retention-record-with-a-long-id'), false);
  assert.match(anonymizedId, /^ANON:[A-Za-z0-9_-]{11}$/);

  await query(
    `INSERT INTO users (id,username,password,student_id,role,created_at)
     VALUES ('retention-user','Retained Name','hash','retention-student','student',$1)`,
    [new Date('2022-09-05T00:00:00.000Z')],
  );
  await query(
    `INSERT INTO activities (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,leader_ids,leader_details,idempotency_key,
      activity_submitter_id,activity_submitter_name,activity_submitter_student_id)
     VALUES ('retention-activity','fact',$1,$1,'x','x','Retained Name','retention-student',$2,$3,'retention-user:activity','retention-user','Retained Name','retention-student')`,
    [new Date('2022-01-01T00:00:00.000Z'), JSON.stringify(['retention-user']), JSON.stringify([{ id: 'retention-user', student_id: 'retention-student', name: 'Retained Name' }])],
  );
  await query(
    `INSERT INTO activities (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,scope_type)
     VALUES ('retention-other-college','legacy fact',$1,$1,'x','x','Retained Name','retention-student','other_college')`,
    [new Date('2022-01-01T00:00:00.000Z')],
  );
  await query(
    `INSERT INTO activities (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,leader_ids,leader_details)
     VALUES ('unrelated-activity','other',$1,$1,'x','x','Other Name','other-phone',$2,$3)`,
    [new Date('2022-01-01T00:00:00.000Z'), JSON.stringify(['other']), JSON.stringify([{ id: 'other', student_id: 'other-student' }])],
  );
  await query(
    `INSERT INTO attendance_work_arrangements (id,student_names,schedules,ocr_names)
     VALUES ('unrelated-attendance',$1,$2,$3)`,
    [JSON.stringify([{ student_id: 'other-student', name: 'Other Student' }]), '[]', '[]'],
  );
  await query(
    `INSERT INTO leave_requests (id,student_id,class_name,student_name,leave_type,applicant_user_id,applicant_name,applicant_student_id)
     VALUES ('retention-leave','retention-student','class','Retained Name','x','retention-user','Retained Name','retention-student')`,
  );
  await query(
    `INSERT INTO leave_requests (id,student_id,class_name,student_name,leave_type,applicant_user_id,applicant_name,applicant_student_id)
     VALUES ('represented-leave','other-student','other-class','Other Student','x','retention-user','Retained Name','retention-student')`,
  );
  await query(
    `INSERT INTO leave_groups (id,class_name,applicant_user_id,applicant_name,applicant_student_id,start_time,end_time)
     VALUES ('retention-group','class','retention-user','Retained Name','retention-student',NOW(),NOW())`,
  );
  await query(
    `INSERT INTO leave_group_members (id,group_id,student_id,student_name,class_name)
     VALUES ('retention-member','retention-group','retention-student','Retained Name','class'),
            ('represented-member','retention-group','other-student','Other Student','other-class')`,
  );
  await query(
    `INSERT INTO leave_slips (id,applicant_user_id,applicant_name,applicant_student_id,class_names,ocr_names)
     VALUES ('retention-slip','retention-user','Retained Name','retention-student','class',$1)`,
    ['[]'],
  );
  await query(
    `INSERT INTO leave_slip_students (id,slip_id,student_id,student_name,class_name)
     VALUES ('retention-slip-student','retention-slip','retention-student','Retained Name','class'),
            ('represented-slip-student','retention-slip','other-student','Other Student','other-class')`,
  );
  await query(
    `INSERT INTO audit_logs (actor_user_id,actor_name,action,resource_type)
     VALUES ('retention-user','Retained Name','test','test')`,
  );
  const actor = { id: 'local-admin', username: 'admin', role: 'admin' };
  const disposed = await disposeRegisteredUser(actor, 'retention-user', 'graduation');
  assert.equal(disposed.deleted, true);
  assert.equal(disposed.retainedFacts, true);
  assert.equal(disposed.complete, true);
  assert.equal(disposed.error, undefined);
  assert.equal((await queryOne('SELECT id FROM users WHERE id=$1', ['retention-user'])), null);
  assert.deepEqual(await queryOne('SELECT activity_submitter_id,activity_submitter_name,activity_submitter_student_id FROM activities WHERE id=$1', ['retention-activity']), {
    activity_submitter_id: null, activity_submitter_name: null, activity_submitter_student_id: null,
  });
  assert.deepEqual(await queryOne('SELECT student_id,student_name,applicant_user_id FROM leave_requests WHERE id=$1', ['retention-leave']), {
    student_id: anonymizedStudentId('retention-leave'), student_name: 'ANONYMIZED', applicant_user_id: null,
  });
  assert.deepEqual(await queryOne('SELECT student_id,student_name FROM leave_requests WHERE id=$1', ['represented-leave']), {
    student_id: 'other-student', student_name: 'Other Student',
  });
  assert.deepEqual(await queryOne('SELECT student_id,student_name FROM leave_group_members WHERE id=$1', ['represented-member']), {
    student_id: 'other-student', student_name: 'Other Student',
  });
  assert.equal((await queryOne('SELECT student_id FROM leave_group_members WHERE id=$1', ['retention-member']))?.student_id, anonymizedStudentId('retention-member'));
  assert.equal((await queryOne('SELECT applicant_user_id FROM leave_slips WHERE id=$1', ['retention-slip']))?.applicant_user_id, null);
  assert.equal((await queryOne('SELECT student_id FROM leave_slip_students WHERE id=$1', ['represented-slip-student']))?.student_id, 'other-student');
  assert.equal((await queryOne('SELECT student_id FROM leave_slip_students WHERE id=$1', ['retention-slip-student']))?.student_id, anonymizedStudentId('retention-slip-student'));
  assert.deepEqual(await queryOne('SELECT leader_name,leader_phone FROM activities WHERE id=$1', ['retention-activity']), {
    leader_name: 'ANONYMIZED', leader_phone: 'ANONYMIZED',
  });
  assert.deepEqual(await queryOne('SELECT leader_name,leader_phone FROM activities WHERE id=$1', ['retention-other-college']), {
    leader_name: 'ANONYMIZED', leader_phone: 'ANONYMIZED',
  });
  assert.equal((await queryOne('SELECT idempotency_key FROM activities WHERE id=$1', ['retention-activity']))?.idempotency_key, null);
  assert.equal((await queryOne('SELECT actor_user_id,actor_name FROM audit_logs WHERE action=$1', ['test']))?.actor_user_id, null);

  await query(`INSERT INTO users (id,username,password,student_id,role,created_at) VALUES ('blocked-user','Blocked Name','hash','blocked-student','student',$1)`, [new Date('2022-01-01T00:00:00.000Z')]);
  await query(`INSERT INTO upload_assets (url,uploaded_by_user_id,purpose,created_at) VALUES ('/uploads/blocked.png','blocked-user','test',$1)`, [new Date('2026-09-01T00:00:00.000Z')]);
  const assetOwnerDisposed = await disposeRegisteredUser(actor, 'blocked-user', 'graduation');
  assert.equal(assetOwnerDisposed.deleted, true);
  assert.equal(assetOwnerDisposed.complete, true);
  assert.equal(await queryOne('SELECT id FROM users WHERE id=$1', ['blocked-user']), null);
  assert.equal((await queryOne('SELECT uploaded_by_user_id FROM upload_assets WHERE url=$1', ['/uploads/blocked.png']))?.uploaded_by_user_id, null);

  await query(`INSERT INTO users (id,username,password,student_id,role,created_at) VALUES ('ambiguous-user','Ambiguous Name','hash','ambiguous-student','student',$1)`, [new Date('2022-01-01T00:00:00.000Z')]);
  await query(
    `INSERT INTO activities (id,full_name,start_time,end_time,category,level,leader_name,leader_phone,scope_type)
     VALUES ('ambiguous-other-college','ambiguous fact',$1,$1,'x','x','Ambiguous Name / Other','ambiguous-student','other_college')`,
    [new Date('2022-01-01T00:00:00.000Z')],
  );
  const ambiguous = await disposeRegisteredUser(actor, 'ambiguous-user', 'graduation');
  assert.equal(ambiguous.deleted, false);
  assert.equal(ambiguous.error, 'REVIEW_REQUIRED');
  assert.ok(ambiguous.unresolved.some((issue) => issue.recordId === 'ambiguous-other-college' && issue.reason === 'UNSAFE_LEGACY_IDENTITY'));
  assert.ok(await queryOne('SELECT id FROM users WHERE id=$1', ['ambiguous-user']));
  assert.deepEqual(await queryOne('SELECT leader_name,leader_phone FROM activities WHERE id=$1', ['ambiguous-other-college']), {
    leader_name: 'Ambiguous Name / Other', leader_phone: 'ambiguous-student',
  });

  await query(`INSERT INTO users (id,username,password,student_id,role,created_at) VALUES ('json-object-user','JSON Object Name','hash','json-object-student','student',$1)`, [new Date('2022-01-01T00:00:00.000Z')]);
  await query(`INSERT INTO leave_slips (id,applicant_user_id,class_names,ocr_names) VALUES ('json-object-slip','json-object-user','class','{}')`);
  await query(`INSERT INTO leave_slip_students (id,slip_id,student_id,student_name,class_name) VALUES ('json-object-student-row','json-object-slip','json-object-student','JSON Object Name','class')`);
  const jsonObject = await disposeRegisteredUser(actor, 'json-object-user', 'graduation');
  assert.equal(jsonObject.deleted, false);
  assert.equal(jsonObject.error, 'REVIEW_REQUIRED');
  assert.ok(jsonObject.unresolved.some((issue) => issue.recordId === 'json-object-slip' && issue.reason === 'UNSAFE_OCR'));
  assert.ok(await queryOne('SELECT id FROM users WHERE id=$1', ['json-object-user']));

  const repeated = await disposeRegisteredUser(actor, 'retention-user', 'graduation');
  assert.equal(repeated.deleted, false);
  assert.equal(repeated.alreadyDisposed, true);
  assert.equal(repeated.error, undefined);

  const lastAdmin = await disposeRegisteredUser(actor, 'local-admin', 'manual_delete');
  assert.equal(lastAdmin.deleted, false);
  assert.equal(lastAdmin.error, 'LAST_ADMIN');

  await query(`UPDATE users SET created_at=$1 WHERE id='local-admin'`, [new Date('2022-09-04T23:59:59.000Z')]);
  const preview = await previewDataRetention({ now: new Date('2026-09-05T00:00:00.000Z'), limit: 10 });
  assert.ok(preview.skippedAdmins.some((candidate) => candidate.id === 'local-admin'));
  assert.equal(preview.users.some((candidate) => candidate.id === 'local-admin'), false);
  const automatic = await runDataRetention({ actor: null, now: new Date('2026-09-05T00:00:00.000Z'), limit: 10 });
  assert.ok(automatic.skippedAdmins.includes('local-admin'));
  assert.ok(await queryOne('SELECT id FROM users WHERE id=$1', ['local-admin']));

  const routePreview = await POST(request({ action: 'preview', limit: 10 }, 'local-admin'));
  assert.equal(routePreview.status, 200);
  const routePreviewBody = await routePreview.json();
  assert.equal(routePreviewBody.success, true);
  assert.equal(routePreviewBody.mode, 'preview');
  assert.ok(Array.isArray(routePreviewBody.data.users));
  console.log('data retention lifecycle tests passed');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
