import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { requirePermission } from '@/lib/auth';
import { assertSafeRemoteImageUrl } from '@/lib/image-url';
import { selectStudentIdAfterRosterLookup } from '@/lib/ocr-student-id-validation';
import { query } from '@/storage/database/supabase-client';

function runPythonOcr(pythonPath: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    // 保留 stderr：运行环境出错时返回真实原因，不能只显示无意义的退出码。
    const child = spawn(pythonPath, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr: Uint8Array[] = [];
    child.stderr?.on('data', (chunk: Uint8Array) => stderr.push(chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('自动识别超时'));
    }, 120000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        const details = Buffer.concat(stderr).toString('utf8').trim();
        reject(new Error(`OCR 脚本退出码：${code}${details ? `（${details.slice(-500)}）` : ''}`));
      }
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
    // DNS 可能在校验与请求之间变化；请求前再次校验，缩小 TOCTOU 窗口。
    if (!(await assertSafeRemoteImageUrl(imageUrl))) {
      throw new Error('远程图片地址不合法或指向内网');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(imageUrl, { redirect: 'error', signal: controller.signal });
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

type OcrClassStudentGroup = { class_name?: unknown; students?: unknown; student_ids?: unknown };
type RosterStudent = { class_name: string; student_id: string; student_name: string };

function classStudentGroups(value: unknown): Array<{ class_name: string; students: string[]; student_ids: string[] }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const group = item as OcrClassStudentGroup;
    const class_name = String(group.class_name || '').trim();
    const students = Array.isArray(group.students)
      ? group.students.map((name) => String(name).trim()).filter(Boolean)
      : [];
    if (!class_name || !students.length) return [];
    const rawIds = Array.isArray(group.student_ids) ? group.student_ids : [];
    const student_ids = students.map((_, index) => String(rawIds[index] || '').trim());
    return [{ class_name, students, student_ids }];
  });
}

async function validateClassStudentsAgainstRoster(perImage: OcrPatch[]): Promise<OcrPatch[]> {
  return Promise.all(perImage.map(async (patch) => {
    const groups = classStudentGroups(patch.fields.class_students);
    if (!groups.length) return patch;

    const validatedGroups = await Promise.all(groups.map(async (group) => {
      const unresolvedNames = group.students;
      try {
        const matches = await query<RosterStudent>(
          `SELECT class_name, student_id, student_name FROM class_roster WHERE class_name=$1 AND student_name = ANY($2::text[])
           UNION ALL
           SELECT class_name, student_id, username AS student_name FROM users WHERE class_name=$1 AND username = ANY($2::text[])`,
          [group.class_name, unresolvedNames],
        );
        const idsByName = new Map<string, string[]>();
        for (const match of matches) {
          const name = String(match.student_name || '').trim();
          const studentId = String(match.student_id || '').trim();
          if (!name || !studentId) continue;
          idsByName.set(name, [...new Set([...(idsByName.get(name) || []), studentId])]);
        }
        return {
          ...group,
          student_ids: group.students.map((name, index) => {
            const candidates = idsByName.get(name) || [];
            const ocrStudentId = group.student_ids[index];
            // OCR 已读出的学号不能被花名册查询结果覆盖或清空：图片中的班级
            // 可能是“虚拟2531”这类简称，而花名册保存完整班级名。只有原图
            // 没有学号时，才在候选唯一的前提下按花名册补全。
            return selectStudentIdAfterRosterLookup(ocrStudentId, candidates);
          }),
        };
      } catch (error) {
        console.warn('按花名册补全 OCR 学号失败，将保留人工补全：', error);
        return group;
      }
    }));

    return { ...patch, fields: { ...patch.fields, class_students: validatedGroups } };
  }));
}

function mergeClassStudents(perImage: OcrPatch[]): Array<{ class_name: string; students: string[]; student_ids: string[] }> {
  const merged = new Map<string, Array<{ student: string; studentId: string }>>();
  for (const patch of perImage) {
    for (const group of classStudentGroups(patch.fields.class_students)) {
      const existing = merged.get(group.class_name) || [];
      group.students.forEach((student, index) => {
        const studentId = group.student_ids[index] || '';
        // 姓名不是唯一键：同班同名而学号不同的学生必须分别保留。
        // 没有学号的 OCR 初稿才按姓名去重，避免多图重复录入同一个人。
        const alreadyExists = studentId
          ? existing.some((item) => item.studentId === studentId)
          : existing.some((item) => item.student === student && !item.studentId);
        if (!alreadyExists) existing.push({ student, studentId });
      });
      merged.set(group.class_name, existing);
    }
  }
  return [...merged].map(([class_name, students]) => ({
    class_name,
    students: students.map((item) => item.student),
    student_ids: students.map((item) => item.studentId),
  }));
}

// POST /api/ocr/analyze
// body: { imageUrls: string[] } 或 { imageUrl: string }，地址来自 /api/upload 的返回值。
// 返回多张截图合并后的识别行和初步字段（需人工核对）。
export async function POST(request: NextRequest) {
  try {
    let auth = await requirePermission(request, 'manageOriginalLeave');
    if (auth.response) {
      auth = await requirePermission(request, 'uploadLeave');
      if (auth.response) {
        auth = await requirePermission(request, 'submitOriginalLeave');
        if (auth.response) {
          auth = await requirePermission(request, 'startGroupLeave');
          if (auth.response) return auth.response;
        }
      }
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
        if (!result?.ok) throw new Error(result?.error || '自动识别失败');
        perImage.push({ image: index, url: imageUrl, lines: result.lines || [], fields: result.fields || {} });
      }

        const enrichedPerImage = await validateClassStudentsAgainstRoster(perImage);
      const lines = enrichedPerImage.flatMap((result) => result.lines.map((line) => ({ ...line, image: result.image })));

      const firstNonEmpty = (selector: (fields: Record<string, unknown>) => string) => (
        enrichedPerImage.map((patch) => selector(patch.fields)).find((value) => Boolean(value)) || ''
      );

      const timeSourceIndex = enrichedPerImage.findIndex((patch) => Boolean(String(patch.fields.start_time || '')));
      const mergedClassStudents = mergeClassStudents(enrichedPerImage);
      // Keep the legacy flat list safe for cached/older page bundles: when a
      // table is present, it must be derived from the left-side structured rows,
      // never from ungrouped OCR text that also contains counsellor columns.
      const structuredStudents = mergedClassStudents.flatMap((group) => group.students);
      const fields = {
        activity_name: firstNonEmpty((patch) => String(patch.activity_name || '')),
        classes: unique(enrichedPerImage.flatMap((patch) => Array.isArray(patch.fields.classes) ? patch.fields.classes.map(String) : [])),
        students: unique(structuredStudents.length
          ? structuredStudents
          : enrichedPerImage.flatMap((patch) => Array.isArray(patch.fields.students) ? patch.fields.students.map(String) : [])),
        student_ids: unique(mergedClassStudents.flatMap((group) => group.student_ids)),
        class_students: mergedClassStudents,
        start_time: firstNonEmpty((patch) => String(patch.start_time || '')),
        end_time: firstNonEmpty((patch) => String(patch.end_time || '')),
        time_source_image: timeSourceIndex >= 0 ? timeSourceIndex : null,
        counselor_signature: enrichedPerImage.some((patch) => patch.fields.counselor_signature === true),
        official_seal: enrichedPerImage.some((patch) => patch.fields.official_seal === true),
        teacher_signature: enrichedPerImage.some((patch) => patch.fields.teacher_signature === true),
        cover_line: enrichedPerImage.map((patch) => String(patch.fields.cover_line || '')).filter(Boolean).join('\n'),
        suggested_notes: timeSourceIndex >= 0
          ? `多张截图：请假时间取自第 ${timeSourceIndex + 1} 张截图；公章/签字按整份材料的侧面（骑缝章）核验，任一张截图识别到即视为有。`
          : 'OCR 多图初稿，请人工核对班级、姓名、时间后再保存。',
      };

      return NextResponse.json({ success: true, data: { lines, fields, perImage: enrichedPerImage } });
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch (error) {
    console.error('自动识别失败:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '自动识别失败' }, { status: 500 });
  }
}
