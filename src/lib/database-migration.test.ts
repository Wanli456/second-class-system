import assert from 'node:assert/strict';
import { ensureDatabaseSchema, query } from '@/storage/database/supabase-client';

async function run() {
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
    ['activity_submissions', ['category_primary', 'category_secondary', 'registration_end_time', 'registration_start_time', 'scoring_material_submitter_name', 'scoring_material_submitter_student_id']],
  );
  assert.deepEqual(submissionColumns.map((column) => column.column_name), ['category_primary', 'category_secondary', 'registration_end_time', 'registration_start_time', 'scoring_material_submitter_name', 'scoring_material_submitter_student_id']);
  console.log('database migration tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
