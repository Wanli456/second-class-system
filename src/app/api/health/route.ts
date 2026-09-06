import { NextResponse } from 'next/server';
import { query } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    await query('SELECT 1');
    return NextResponse.json({ ok: true, database: 'ok', time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, database: 'error' }, { status: 503 });
  }
}
