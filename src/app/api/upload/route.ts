import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// POST /api/upload - 上传文件到本地存储
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: '缺少文件' }, { status: 400 });
    }

    // 检查文件大小 (最大 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: '文件大小不能超过5MB' }, { status: 400 });
    }

    // 生成唯一文件名
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    
    // 确保目录存在
    await mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, fileName);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await writeFile(filePath, buffer);

    // 返回公开URL
    const publicUrl = `/uploads/${fileName}`;

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
