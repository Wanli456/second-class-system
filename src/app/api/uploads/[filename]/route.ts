import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUploadContentType } from '@/lib/upload-file-validation';
import { safeUploadFileName } from '@/lib/local-upload';

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const { filename: rawFilename } = await params;
  const filename = safeUploadFileName(rawFilename);
  if (!filename) return NextResponse.json({ success: false, error: '文件地址无效' }, { status: 400 });

  try {
    const buffer = await readFile(path.join(process.cwd(), 'public', 'uploads', filename));
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': getUploadContentType(filename, ''),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: '文件不存在' }, { status: 404 });
  }
}
