import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ensureDatabaseSchema, query } from '@/storage/database/supabase-client';

async function checkSharedInitialization() {
  const runtime = globalThis as typeof globalThis & {
    __secondClassSchemaInitialization?: Promise<void> | null;
    __secondClassLocalDatabase?: { db: { public: { none: (sql: string) => void } } };
  };
  const schema = runtime.__secondClassLocalDatabase!.db.public;
  const originalNone = schema.none;
  const failure = new Error('injected schema failure');
  schema.none = () => { throw failure; };
  try {
    await assert.rejects(ensureDatabaseSchema(), (error) => error === failure);
    assert.equal(runtime.__secondClassSchemaInitialization, null, 'failed initialization is retryable');
  } finally {
    schema.none = originalNone;
  }
  const pending = ensureDatabaseSchema();
  const reload = createRequire(import.meta.url);
  const modulePath = reload.resolve('../storage/database/supabase-client');
  delete reload.cache[modulePath];
  const secondModule = reload(modulePath) as typeof import('@/storage/database/supabase-client');
  assert.equal(secondModule.ensureDatabaseSchema(), pending, 'module reload shares in-flight migration');
  await pending;
  assert.equal(secondModule.ensureDatabaseSchema(), pending, 'completed migration is not replayed');
}

async function run() {
  // Simulate a retained pg-mem table before a new route module initializes.
  await query(`CREATE TABLE file_cleanup_jobs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(), asset_url TEXT NOT NULL UNIQUE,
    staged_path TEXT, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  await checkSharedInitialization();
  await ensureDatabaseSchema();
  const columns = await query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
       AND column_name = ANY($2)
     ORDER BY column_name`,
    ['activity_submissions', ['activity_id', 'registration_start_time', 'registration_end_time']],
  );
  assert.deepEqual(columns.map((column) => column.column_name), ['activity_id', 'registration_end_time', 'registration_start_time']);

  const activityColumns = await query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
       AND column_name = ANY($2)
     ORDER BY column_name`,
    ['activities', ['category_primary', 'category_secondary', 'registration_end_time', 'registration_start_time', 'record_file_url', 'record_photo_url', 'record_photo_file_name', 'scoring_material_submitter_name', 'scoring_material_submitter_student_id']],
  );
  assert.deepEqual(activityColumns.map((column) => column.column_name), [
    'category_primary',
    'category_secondary',
    'record_file_url',
    'record_photo_file_name',
    'record_photo_url',
    'registration_end_time',
    'registration_start_time',
    'scoring_material_submitter_name',
    'scoring_material_submitter_student_id',
  ]);

  const submissionColumns = await query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
       AND column_name = ANY($2)
     ORDER BY column_name`,
    ['activity_submissions', ['category_primary', 'category_secondary', 'idempotency_key', 'registration_end_time', 'registration_start_time', 'scoring_material_submitter_name', 'scoring_material_submitter_student_id']],
  );
  assert.deepEqual(submissionColumns.map((column) => column.column_name), ['category_primary', 'category_secondary', 'idempotency_key', 'registration_end_time', 'registration_start_time', 'scoring_material_submitter_name', 'scoring_material_submitter_student_id']);

  const idempotencyColumns = await query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE column_name = 'idempotency_key'
       AND (table_name=$1 OR table_name=$2 OR table_name=$3 OR table_name=$4 OR table_name=$5 OR table_name=$6)
     ORDER BY table_name`,
    ['activity_submissions', 'evening_study_schedules', 'evening_study_attendance', 'leave_slips', 'original_leave_slips', 'attendance_work_arrangements'],
  );
  assert.deepEqual(idempotencyColumns.map((column) => column.table_name), [
    'activity_submissions', 'attendance_work_arrangements', 'evening_study_attendance',
    'evening_study_schedules', 'leave_slips', 'original_leave_slips',
  ]);
  console.log('database migration tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
