import assert from 'node:assert/strict';
import { ensureDatabaseSchema, query } from '@/storage/database/supabase-client';

async function run() {
  await ensureDatabaseSchema();
  const columns = await query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
       AND column_name = ANY($2)`,
    ['activity_submissions', ['activity_id']],
  );
  assert.deepEqual(columns.map((column) => column.column_name), ['activity_id']);

  const activityColumns = await query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
       AND column_name = ANY($2)
     ORDER BY column_name`,
    ['activities', ['category_primary', 'category_secondary', 'record_file_url', 'record_photo_url', 'record_photo_file_name']],
  );
  assert.deepEqual(activityColumns.map((column) => column.column_name), [
    'category_primary',
    'category_secondary',
    'record_file_url',
    'record_photo_file_name',
    'record_photo_url',
  ]);

  const submissionColumns = await query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
       AND column_name = ANY($2)
     ORDER BY column_name`,
    ['activity_submissions', ['category_primary', 'category_secondary']],
  );
  assert.deepEqual(submissionColumns.map((column) => column.column_name), ['category_primary', 'category_secondary']);
  console.log('database migration tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
