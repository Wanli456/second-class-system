import { query, queryOne } from '@/storage/database/supabase-client';

const OCR_UPLOAD_PURPOSES = ['leave', 'original-leave', 'group-leave', 'attendance-work'] as const;

type ImageRefRow = { image_url?: string | null; image_list?: string | null };

function imageListContains(value: string | null | undefined, url: string): boolean {
  try {
    const images: unknown = JSON.parse(value || '[]');
    return Array.isArray(images) && images.some((image: unknown) => (
      typeof image === 'object' && image !== null && 'url' in image && image.url === url
    ));
  } catch {
    return false;
  }
}

function hasImageReference(rows: ImageRefRow[], url: string): boolean {
  return rows.some((row) => row.image_url === url || imageListContains(row.image_list, url));
}

export async function canAccessOcrAttachment(
  url: string,
  userId: string,
  permissions: { isAdmin?: boolean; canManageOriginalLeave?: boolean; canManageAttendanceWork?: boolean } = {},
): Promise<boolean> {
  if (permissions.isAdmin) return true;

  const ownUpload = await queryOne<{ url: string }>(
    `SELECT url FROM upload_assets WHERE url=$1 AND uploaded_by_user_id=$2 AND purpose = ANY($3::text[])`,
    [url, userId, OCR_UPLOAD_PURPOSES],
  );
  if (ownUpload) return true;

  const ownLeaveImages = await query<ImageRefRow>(
    'SELECT leave_image_url AS image_url, image_list FROM leave_slips WHERE applicant_user_id=$1',
    [userId],
  );
  if (hasImageReference(ownLeaveImages, url)) return true;

  if (permissions.canManageOriginalLeave) {
    const originalImages = await query<ImageRefRow>('SELECT image_url, image_list FROM original_leave_slips', []);
    if (hasImageReference(originalImages, url)) return true;
  }

  if (permissions.canManageAttendanceWork) {
    const attendanceImages = await query<ImageRefRow>('SELECT image_list FROM attendance_work_arrangements', []);
    if (hasImageReference(attendanceImages, url)) return true;
  }

  return false;
}
