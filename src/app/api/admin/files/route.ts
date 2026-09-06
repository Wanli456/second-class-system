import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { listManagedFiles } from '@/lib/data-retention-files';

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  const page = positiveInteger(request.nextUrl.searchParams.get('page'), 1, 100000);
  const pageSize = positiveInteger(request.nextUrl.searchParams.get('pageSize'), 50, 100);
  const data = await listManagedFiles(page, pageSize);
  return NextResponse.json({ success: true, data: { page, pageSize, ...data } });
}
