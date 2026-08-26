import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { requireUser } from '@/lib/auth';
import { detectFileKindFromBytes, getUploadFileKind, UPLOAD_FILE_FORMAT_HINT } from '@/lib/upload-file-validation';
import { publicUploadError } from '@/lib/upload-error';

// POST /api/upload - 上传文件到雨云服务器本地存储
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response) return auth.response;

    const formData = await request.formData();
    const fileEntry = formData.get('file');

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ success: false, error: '缺少文件' }, { status: 400 });
    }
    const file = fileEntry;

    // 检查文件大小 (最大 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: '文件大小不能超过5MB' }, { status: 400 });
    }

    // 限制为业务需要的图片和常用文档，避免任意文件上传。
    const originalName = path.basename(file.name).replace(/[\\/]/g, '');
    const ext = (originalName.split('.').pop() || '').toLowerCase();
    const extKind = getUploadFileKind(originalName);
    if (!extKind) {
      return NextResponse.json({ success: false, error: '仅支持' + UPLOAD_FILE_FORMAT_HINT }, { status: 400 });
    }

    // 生成唯一文件名，杜绝路径穿越
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 扩展名之外再校验文件头，防止把可执行文件等危险内容改扩展名伪装成图片/文档绕过上面的校验。
    const actualKind = detectFileKindFromBytes(buffer, originalName);
    if (!actualKind || actualKind !== extKind) {
      return NextResponse.json({ success: false, error: '文件内容与扩展名不匹配，请重新选择文件' }, { status: 400 });
    }
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    
    // 确保目录存在
    await mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, buffer);

    // 返回公开URL
    const publicUrl = `/uploads/${fileName}`;

    return NextResponse.json({ success: true, url: publicUrl, file_name: originalName });
  } catch (err) {
    console.error('文件上传失败:', err);
    return NextResponse.json({ success: false, error: publicUploadError(err) }, { status: 500 });
  }
}
