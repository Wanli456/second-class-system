import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { publicUser, requireUser } from '@/lib/auth';
import { getUploadContentType } from '@/lib/upload-file-validation';
import { safeUploadFileName } from '@/lib/local-upload';
import { queryOne } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;

  const { filename: rawFilename } = await params;
  const filename = safeUploadFileName(rawFilename);
  if (!filename) return NextResponse.json({ success: false, error: '文件地址无效' }, { status: 400 });

  const url = `/uploads/${filename}`;
  const user = auth.user!;
  const isAdmin = user.role === 'admin';
  if (!isAdmin) {
    const permissions = publicUser(user);
    const reference = await queryOne<{ allowed: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM activities WHERE $1 IN (plan_file_url, record_file_url)
          AND ($2 = activity_submitter_id OR leader_ids LIKE '%"' || $2 || '"%' OR $3)
        UNION ALL SELECT 1 FROM activities WHERE $1 IN (scoring_table_url, record_photo_url)
          AND ($2 IN (activity_submitter_id, scoring_material_submitter_id) OR leader_ids LIKE '%"' || $2 || '"%' OR $4)
        UNION ALL SELECT 1 FROM activity_submissions WHERE $1 IN (plan_file_url, record_file_url)
          AND ($2 = activity_submitter_id OR leader_ids LIKE '%"' || $2 || '"%' OR $3)
        UNION ALL SELECT 1 FROM leave_slips WHERE $1 IN (leave_image_url, image_list) AND ($2=applicant_user_id OR $6 OR $7)
        UNION ALL SELECT 1 FROM original_leave_slips WHERE $1 IN (image_url, image_list) AND ($2=created_by_user_id OR $8)
      ) AS allowed`,
      [url, user.id, permissions.canPublish, permissions.canScore, permissions.canPublish, permissions.canReviewLeave, permissions.canQueryLeave, permissions.canManageOriginalLeave],
    );
    if (!reference?.allowed) return NextResponse.json({ success: false, error: '无权访问该文件' }, { status: 403 });
  }

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
