import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { deleteManagedFile, findFileReferences, isManagedUploadUrl } from '@/lib/data-retention-files';

function assetUrl(id: string): string | null {
  const url = id.startsWith('/uploads/') ? id : '/uploads/' + id;
  return isManagedUploadUrl(url) ? url : null;
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requirePermission(request, 'admin');
  if (auth.response) return auth.response;
  const url = assetUrl((await params).id);
  if (!url) return NextResponse.json({ success: false, error: '无效文件标识' }, { status: 400 });
  const references = await findFileReferences(url);
  const confirmed = request.nextUrl.searchParams.get('confirm') === 'true';
  const detachReferences = request.nextUrl.searchParams.get('detachReferences') === 'true';
  if (references.length && !(confirmed && detachReferences)) {
    return NextResponse.json({ success: false, error: '文件仍被业务记录引用；确认后可清除引用但保留业务事实', data: { references } }, { status: 409 });
  }
  if (!confirmed) return NextResponse.json({ success: false, error: '永久删除需要 confirm=true' }, { status: 400 });
  const result = await deleteManagedFile(url, { detachReferences, confirmed, automatic: false, actor: auth.user });
  if (result.status === 'not_found') return NextResponse.json({ success: false, error: '文件记录不存在' }, { status: 404 });
  if (result.status === 'pending') return NextResponse.json({ success: false, error: '物理删除未完成，已保留重试任务', data: { retryPending: true } }, { status: 503 });
  if (!result.ok) return NextResponse.json({ success: false, error: '文件删除失败' }, { status: 500 });
  return NextResponse.json({ success: true, message: '文件已永久删除；业务事实记录已保留' });
}
