'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { PageErrorDialog } from '@/components/PageErrorDialog';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { Button } from '@/components/ui/button';
import { ImageUploadPreviews } from '@/components/ImageUploadPreviews';

type ParsedStudent = { student_id: string; student_name: string; class_name: string };
type UploadedImage = { url: string; name: string };
type OcrPayload = { success?: boolean; error?: string; data?: { lines?: unknown; fields?: { student_ids?: unknown; students?: unknown; classes?: unknown; cover_line?: unknown } } };

function isStudentId(value: string): boolean {
  return /^\d{6,18}$/.test(value.trim());
}

function isClassName(value: string): boolean {
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) return false;
  // “虚拟2531”“虚拟现实技术应用2531”等无“班”字的专业简称 + 年级班号也属于班级。
  return /班$/u.test(normalized)
    || /^[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z（）()·-]{0,30}(?:20|21|22|23|24|25|26)\d{2}$/u.test(normalized);
}

function parseStudentFields(text: string): ParsedStudent | null {
  const fields = text.split(/[｜|，,\t]+/).flatMap((item) => item.trim().split(/\s+/))
    .map((item) => item.replace(/^(?:学号|姓名|班级)\s*[:：]?\s*/u, '').trim()).filter(Boolean);
  const studentId = fields.find(isStudentId) || '';
  const className = fields.find(isClassName) || '';
  const studentName = fields.find((item) => item !== studentId && item !== className
    && !/^(?:辅导员|导员|班主任|指导老师|老师|签字|联系电话|电话)/u.test(item)
    && /^[\u4e00-\u9fff]{2,8}$/u.test(item)) || '';
  return studentId && studentName && className ? { student_id: studentId, student_name: studentName, class_name: className } : null;
}

function parseStudentLines(text: string): ParsedStudent[] {
  return text.split(/\r?\n/).map((line) => parseStudentFields(line.trim())).filter((student): student is ParsedStudent => Boolean(student));
}

async function cropImageToLeftHalf(file: File): Promise<File> {
  // 仅裁切供自动识别使用的副本；完整原图仍照常保存，避免把右侧导员信息纳入学生名单。
  if (!file.type.startsWith('image/')) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('图片加载失败'));
      element.src = objectUrl;
    });
    const width = Math.max(1, Math.floor(image.naturalWidth / 2));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, width, image.naturalHeight, 0, 0, width, image.naturalHeight);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type || 'image/png'));
    return blob ? new File([blob], file.name, { type: blob.type || file.type, lastModified: file.lastModified }) : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function formatOcrStudents(payload: OcrPayload): string[] {
  const fields = payload.data?.fields;
  const fromLines = parseStudentLines(stringList(payload.data?.lines).join('\n'));
  const ids = stringList(fields?.student_ids);
  const names = stringList(fields?.students);
  const classes = stringList(fields?.classes);
  const fromFields = ids.map((id, index) => ({ student_id: id, student_name: names[index] || '', class_name: classes[index] || classes[0] || '' })).filter((student) => student.student_name);
  return [...fromLines, ...fromFields].filter((student, index, all) => all.findIndex((item) => item.student_id === student.student_id) === index).map((student) => [student.student_id, student.student_name, student.class_name].filter(Boolean).join(' '));
}

export default function TemporaryLeavePage() {
  const { user, initialized } = useUser();
  const [studentsText, setStudentsText] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [ocrText, setOcrText] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canStart = Boolean(user && (user.role === 'admin' || hasPermission(user, 'canStartGroupLeave')));

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) {
    return (
      <DashboardLayout user={user} title="临时请假" activeNavHref="/leave-slip/temporary">
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">请先登录。</div>
      </DashboardLayout>
    );
  }
  if (!canStart) {
    return (
      <DashboardLayout user={user} title="临时请假" activeNavHref="/leave-slip/temporary">
        <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="font-semibold text-amber-900">当前账号没有临时请假提交权限</h2>
          <p className="mt-2 text-sm text-amber-800">请联系系统管理员授予 `canStartGroupLeave` 权限。</p>
        </div>
      </DashboardLayout>
    );
  }

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (files.some((file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)) {
      setError('请选择图片文件，且单张临时请假图片不能超过 5MB');
      return;
    }
    setError(null);
    setRecognizing(true);
    let imagesUploaded = false;
    try {
      const uploaded: UploadedImage[] = [];
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        const response = await apiFetch('/api/upload', { method: 'POST', body });
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !(data as { success?: boolean }).success) throw new Error((data as { error?: string })?.error || '图片上传失败');
        const upload = data as { url?: unknown; file_name?: unknown };
        if (!upload.url) throw new Error('图片上传后未返回地址');
        uploaded.push({ url: String(upload.url), name: String(upload.file_name || file.name) });
      }
      setImageFiles((previous) => [...previous, ...files]);
      setUploadedImages((previous) => [...previous, ...uploaded]);
      files.forEach((file) => { const reader = new FileReader(); reader.onload = () => setPreviews((previous) => [...previous, String(reader.result)]); reader.readAsDataURL(file); });
      imagesUploaded = true;
      const ocrFiles = await Promise.all(files.map(cropImageToLeftHalf));
      const ocrUploads: UploadedImage[] = [];
      for (const file of ocrFiles) {
        const body = new FormData();
        body.append('file', file);
        const response = await apiFetch('/api/upload', { method: 'POST', body });
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !(data as { success?: boolean }).success) throw new Error((data as { error?: string })?.error || '识别图片上传失败');
        const upload = data as { url?: unknown; file_name?: unknown };
        if (!upload.url) throw new Error('识别图片上传后未返回地址');
        ocrUploads.push({ url: String(upload.url), name: String(upload.file_name || file.name) });
      }
      const response = await apiFetch('/api/ocr/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrls: ocrUploads.map((item) => item.url) }) });
      const payload = await response.json() as OcrPayload;
      if (!payload.success) throw new Error(payload.error || '自动识别失败');
      const rows = formatOcrStudents(payload);
      if (rows.length) setStudentsText((previous) => [...previous.split('\n').filter(Boolean), ...rows].join('\n'));
      setOcrText(stringList(payload.data?.lines).slice(0, 30).join('\n') || String(payload.data?.fields?.cover_line || ''));
      if (!rows.length) setError('未能完整识别学生信息，请按“学号、姓名、班级”每行一名手工补全，三项顺序不限。');
    } catch (recognitionError) {
      setError((imagesUploaded ? '图片已上传，但自动识别未完成：' : '图片上传失败：') + (recognitionError instanceof Error ? recognitionError.message : '请手工填写名单'));
    } finally {
      setRecognizing(false);
    }
  };

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!startTime || !endTime) { setError('请选择开始和结束时间'); return; }
    if (endTime <= startTime) { setError('结束时间必须晚于开始时间'); return; }
    const students = parseStudentLines(studentsText);
    if (!students.length || students.some((student) => !student.class_name)) { setError('请至少填写一名学生，并补全学号、姓名、班级；三项顺序不限'); return; }
    if (!imageFiles.length) { setError('请上传临时请假图片'); return; }
    if (imageFiles.length !== uploadedImages.length) { setError('请等待图片上传完成后再提交'); return; }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/leave-slips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slip_type: '其他请假',
          leave_type: '临时请假',
          class_names: [...new Set(students.map((student) => student.class_name))],
          students,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          images: uploadedImages,
          ocr_names: students.map((student) => student.student_name),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '提交失败');
      const warningText = Array.isArray(data.warnings) && data.warnings.length ? `（${data.warnings.join('；')}）` : '';
      setSuccess(`临时请假已提交并通过自动审核，立即生效。${warningText}`);
      setStudentsText('');
      setImageFiles([]);
      setUploadedImages([]);
      setPreviews([]);
      setOcrText('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout user={user} title="临时请假" activeNavHref="/leave-slip/temporary">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase text-teal-700">其他请假 / 临时请假</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">临时请假（自动审核）</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">适用于临时性、无需人工查对的请假。提交后自动通过并立即生效，请确保名单和图片真实有效。</p>
        </header>

        {success && <div role="status" className="sr-only">{success}</div>}

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">开始时间
              <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">结束时间
              <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
          </div>

          <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition-colors hover:border-teal-400 hover:bg-teal-50/40">
            <span className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-slate-200"><Upload className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{recognizing ? '正在上传并自动识别…' : imageFiles.length ? `已选 ${imageFiles.length} 张图片，识别结果可编辑` : '选择临时请假图片（可多张截图）'}</span><span className="mt-0.5 block text-xs text-slate-500">上传后自动识别；单张不超过 5MB</span></span>
              <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">选择文件</span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => void handleImageChange(event)} aria-label="临时请假图片，可多选" />
            </span>
          </label>
          <ImageUploadPreviews
            imageUrls={previews}
            altPrefix="临时请假图片"
            onRemove={(index) => {
              setImageFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
              setUploadedImages((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
              setPreviews((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
            }}
          />
          <label className="mt-4 block text-xs font-semibold text-slate-700">请假学生（每行：学号 姓名 班级）
            <textarea value={studentsText} onChange={(event) => setStudentsText(event.target.value)} rows={5} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder={'2024010101 张三 计算机2101\n2024010102 李四 软件2102'} />
            <span className="mt-1 block text-xs font-normal text-slate-500">名单可跨班；识别不全或不准确时直接在此补充、修改。</span>
          </label>
          {ocrText && <label className="mt-4 block text-xs font-semibold text-slate-700">自动识别文字（含请假内容，最终以原图为准）<textarea value={ocrText} onChange={(event) => setOcrText(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-600" /></label>}

          <div className="mt-5">
            <Button type="button" onClick={() => void submit()} disabled={submitting || recognizing} className="bg-slate-950 hover:bg-slate-800">
              {submitting ? '提交中...' : recognizing ? '正在自动识别...' : '提交并通过自动审核'}
            </Button>
          </div>
        </div>
      </div>

      <PageErrorDialog open={Boolean(error)} message={error} onClose={() => setError(null)} />
      <PageErrorDialog open={Boolean(success)} message={success} tone="success" onClose={() => setSuccess(null)} />
    </DashboardLayout>
  );
}
