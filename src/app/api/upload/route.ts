import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const getCloudStorageConfig = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'app-files';

  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, bucket };
};

async function uploadToCloudStorage(fileName: string, file: File, buffer: Buffer) {
  const config = getCloudStorageConfig();
  if (!config) return null;

  const objectPath = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeURIComponent(fileName)}`;
  const headers = {
    Authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey,
    'Content-Type': file.type || 'application/octet-stream',
    'x-upsert': 'true',
  };

  const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  let response = await fetch(objectPath, { method: 'POST', headers, body });

  // Create the public bucket on first use so deployment does not depend on a
  // separate manual storage setup step.
  if (response.status === 404) {
    const bucketResponse = await fetch(`${config.url}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: config.bucket, name: config.bucket, public: true }),
    });

    if (!bucketResponse.ok && bucketResponse.status !== 409) {
      const error = await bucketResponse.text();
      throw new Error(`云端文件存储桶创建失败：${error}`);
    }

    response = await fetch(objectPath, { method: 'POST', headers, body });
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`云端文件上传失败：${error}`);
  }

  return `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${encodeURIComponent(fileName)}`;
}

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
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const cloudUrl = await uploadToCloudStorage(fileName, file, buffer);
    if (cloudUrl) {
      return NextResponse.json({ success: true, url: cloudUrl });
    }

    if (process.env.PGDATABASE_URL) {
      return NextResponse.json({
        success: false,
        error: '公网部署缺少 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY，无法保存上传文件',
      }, { status: 500 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    
    // 确保目录存在
    await mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, buffer);

    // 返回公开URL
    const publicUrl = `/uploads/${fileName}`;

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
