import assert from 'node:assert/strict';
import { ensureDatabaseSchema, withTransaction } from '@/storage/database/supabase-client';
import { nextActivityId } from './business-rules';

async function run(): Promise<void> {
  await ensureDatabaseSchema();
  const first = await withTransaction((client) => nextActivityId(client, new Date('2099-01-15T00:00:00.000Z')));
  const second = await withTransaction((client) => nextActivityId(client, new Date('2099-01-15T00:00:00.000Z')));
  assert.equal(first, 'EK209901001');
  assert.equal(second, 'EK209901002');
  console.log('activity id counter tests passed');
}

void run();
