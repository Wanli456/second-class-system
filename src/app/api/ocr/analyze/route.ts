import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { requirePermission } from '@/lib/auth';
import { assertSafeRemoteImageUrl } from '@/lib/image-url';

function runPythonOcr(pythonPath: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    // stdio 使用 ignore：本机沙箱可能禁止通过 pipe 捕获子进程输出。
    const child = spawn(pythonPath, args, { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('OCR 识别超时'));
    }, 120000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`OCR 脚本退出码：${code}`));
    });
  });
}

function resolvePythonPath() {
  const root = process.cwd();
  const candidate = process.platform === 'win32'
    ? path.join(root, '.ocr-venv', 'Scripts', 'python.exe')
    : path.join(root, '.ocr-venv', 'bin', 'python');
  if (existsSync(candidate)) return candidate;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function unique(value: string[]): string[] {
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

async function resolveInputPath(imageUrl: string, tempDir: string, index: number): Promise<string> {
  if (/^https?:\/\//i.test(imageUrl)) {
    if (!(await assertSafeRemoteImageUrl(imageUrl))) {
      throw new Error('远程图片地址不合法或指向内网');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(imageUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && contentLength > 8 * 1024 * 1024) {
      throw new Error('远程图片超过 8MB，拒绝下载');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 8 * 1024 * 1024) throw new Error('远程图片超过 8MB，拒绝下载');
    const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
    const inputPath = path.join(tempDir, `image-${index}.${ext}`);
    await writeFile(inputPath, buffer);
    return inputPath;
  }
  if (imageUrl.startsWith('/uploads/') && !imageUrl.includes('..')) {
    const fileName = imageUrl.split('/').pop();
    const inputPath = path.join(process.cwd(), 'public', 'uploads', fileName || '');
    if (!existsSync(inputPath)) throw new Error(`找不到本地图片：${imageUrl}`);
    return inputPath;
  }
  throw new Error('image_url 只支持 /uploads 本地路径或公网 http(s) 图片地址');
}

type OcrLine = { text: string; score?: number };
type OcrPatch = {
  image?: number;
  url?: string;
  image_name?: string;
  lines: OcrLine[];
  fields: Record<string, unknown>;
};

function mergeClassStudents(perImage: OcrPatch[]): Array<{ class_name: string; students: string[]; student_ids: string[] }> {
  const merged = new Map<string, { students: string[]; student_ids: string[] }>();
  for (const patch of perImage) {
    const raw = patch.fields.class_students;
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      const class_name = String(item && (item as { class_name?: unknown }).class_name || '').trim();
      if (!class_name) continue;
      const studentsRaw = (item as { students?: unknown }).students;
      const idsRaw = (item as { student_ids?: unknown }).student_ids;
      const students = Array.isArray(studentsRaw)
        ? studentsRaw.map((name) => String(name).trim()).filter(Boolean)
        : [];
      const student_ids = Array.isArray(idsRaw)
        ? idsRaw.map((id) => String(id).trim()).filter(Boolean)
        : [];
      const existing = merged.get(class_name) || { students: [], student_ids: [] };
      merged.set(class_name, {
        students: [...new Set([...existing.students, ...students])],
        student_ids: [...new Set([...existing.student_ids, ...student_ids])],
      });
    }
  }
  return [...merged].map(([class_name, value]) => ({ class_name, students: value.students, student_ids: value.student_ids }));
}

// POST /api/ocr/analyze
// body: { imageUrls: string[] } 或 { imageUrl: string }，地址来自 /api/upload 的返回值。
// 返回多张截图合并后的识别行和初步字段（需人工核对）。
export async function POST(request: NextRequest) {
  try {
    let auth = await requirePermission(request, 'manageOriginalLeave');
    if (auth.response) {
      auth = await requirePermission(request, 'uploadLeave');
      if (auth.response) return auth.response;
    }

    const body = await request.json();
    const rawUrls = Array.isArray(body.imageUrls) ? body.imageUrls
      : Array.isArray(body.image_urls) ? body.image_urls
        : [body.imageUrl || body.image_url].filter(Boolean);
    const imageUrls = rawUrls.map((url: unknown) => String(url).trim()).filter(Boolean);

    if (!imageUrls.length) return NextResponse.json({ success: false, error: '缺少 imageUrl 或 imageUrls 参数' }, { status: 400 });

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ds-ocr-'));
    const pythonPath = resolvePythonPath();
    const scriptPath = path.join(process.cwd(), 'local-ocr', 'ocr_service.py');
    if (!existsSync(scriptPath)) throw new Error('OCR 服务脚本 local-ocr/ocr_service.py 不存在');

    try {
      const perImage: OcrPatch[] = [];
      for (let index = 0; index < imageUrls.length; index += 1) {
        const imageUrl = imageUrls[index];
        const inputPath = await resolveInputPath(imageUrl, tempDir, index);
        const outputPath = path.join(tempDir, `result-${index}.json`);
        await runPythonOcr(pythonPath, [scriptPath, inputPath, outputPath]);
        const raw = await readFile(outputPath, 'utf8');
        const result = JSON.parse(raw);
        if (!result?.ok) throw new Error(result?.error || 'OCR 识别失败');
        perImage.push({ image: index, url: imageUrl, lines: result.lines || [], fields: result.fields || {} });
      }

      const lines = perImage.flatMap((result) => result.lines.map((line) => ({ ...line, image: result.image })));

      const firstNonEmpty = (selector: (fields: Record<string, unknown>) => string) => (
        perImage.map((patch) => selector(patch.fields)).find((value) => Boolean(value)) || ''
      );

      const timeSourceIndex = perImage.findIndex((patch) => Boolean(String(patch.fields.start_time || '')));
      const fields = {
        activity_name: firstNonEmpty((patch) => String(patch.activity_name || '')),
        classes: unique(perImage.flatMap((patch) => Array.isArray(patch.fields.classes) ? patch.fields.classes.map(String) : [])),
        students: unique(perImage.flatMap((patch) => Array.isArray(patch.fields.students) ? patch.fields.students.map(String) : [])),
        student_ids: unique(perImage.flatMap((patch) => Array.isArray(patch.fields.student_ids) ? patch.fields.student_ids.map(String) : [])),
        class_students: mergeClassStudents(perImage),
        start_time: firstNonEmpty((patch) => String(patch.start_time || '')),
        end_time: firstNonEmpty((patch) => String(patch.end_time || '')),
        time_source_image: timeSourceIndex >= 0 ? timeSourceIndex : null,
        counselor_signature: perImage.some((patch) => patch.fields.counselor_signature === true),
        official_seal: perImage.some((patch) => patch.fields.official_seal === true),
        teacher_signature: perImage.some((patch) => patch.fields.teacher_signature === true),
        cover_line: perImage.map((patch) => String(patch.fields.cover_line || '')).filter(Boolean).join('\n'),
        suggested_notes: timeSourceIndex >= 0
          ? `多张截图：请假时间取自第 ${timeSourceIndex + 1} 张截图；公章/签字按整份材料的侧面（骑缝章）核验，任一张截图识别到即视为有。`
          : 'OCR 多图初稿，请人工核对班级、姓名、时间后再保存。',
      };

      return NextResponse.json({ success: true, data: { lines, fields, perImage } });
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch (error) {
    console.error('OCR 识别失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'OCR 识别失败' }, { status: 500 });
  }
}