'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { PageErrorDialog } from '@/components/PageErrorDialog';
import { apiFetch, createIdempotencyKey } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { Button } from '@/components/ui/button';
import { ImageUploadPreviews } from '@/components/ImageUploadPreviews';

type ParsedStudent = { student_id: string; student_name: string; class_name: string };
type OcrStudentDraft = { student_id: string; student_name: string; class_name: string };
type UploadedImage = { url: string; name: string };
type SubmittedTemporaryLeave = { id: string; slip_type: string; leave_type: string; review_status: string; created_at: string; applicant_user_id?: string | null; submission_count?: number; image_list?: string; leave_image_url?: string | null; leave_image_name?: string | null; start_time?: string | null; end_time?: string | null };
type OcrClassStudents = { class_name?: unknown; students?: unknown; student_ids?: unknown };
type OcrPayload = {
  success?: boolean;
  error?: string;
  data?: {
    lines?: unknown;
    fields?: {
      student_ids?: unknown;
      students?: unknown;
      classes?: unknown;
      class_students?: unknown;
      cover_line?: unknown;
    };
  };
};

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

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function alignedStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()) : [];
}

function studentsFromClassGroups(value: unknown): OcrStudentDraft[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): ParsedStudent[] => {
    const group = item as OcrClassStudents;
    const className = String(group?.class_name || '').trim();
    const ids = alignedStringList(group?.student_ids);
    const names = stringList(group?.students);
    if (!className) return [];

    return names.flatMap((studentName, index) => {
      const studentId = ids[index] || '';
      return studentName ? [{ student_id: studentId, student_name: studentName, class_name: className }] : [];
    });
  });
}

function ocrLineTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (typeof line === 'string') return [line.trim()];
    if (line && typeof line === 'object' && typeof (line as { text?: unknown }).text === 'string') {
      return [(line as { text: string }).text.trim()];
    }
    return [];
  }).filter(Boolean);
}

function formatOcrStudents(payload: OcrPayload): string[] {
  const fields = payload.data?.fields;
  const fromClassGroups = studentsFromClassGroups(fields?.class_students);
  const fromLines = parseStudentLines(ocrLineTexts(payload.data?.lines).join('\n'));
  const ids = stringList(fields?.student_ids);
  const names = stringList(fields?.students);
  const classes = stringList(fields?.classes);
  // 扁平字段缺失班级配对关系时不能用 classes[0] 猜测，避免跨班假条错填。
  const fromFields = ids.flatMap((id, index) => {
    const studentName = names[index] || '';
    const className = classes[index] || '';
    return studentName && className ? [{ student_id: id, student_name: studentName, class_name: className }] : [];
  });
  const candidates: OcrStudentDraft[] = fromClassGroups.length ? fromClassGroups : [...fromLines, ...fromFields];
  return candidates
    .filter((student) => student.student_name && student.class_name)
    .filter((student, index, all) => {
      const key = student.student_id || `${student.student_name}\u0000${student.class_name}`;
      return all.findIndex((item) => (item.student_id || `${item.student_name}\u0000${item.class_name}`) === key) === index;
    })
    // 学号未出现在原图时保留左侧空位：工作人员可直接在姓名前补录学号。
    .map((student) => student.student_id
      ? `${student.student_id} ${student.student_name} ${student.class_name}`
      : ` ${student.student_name} ${student.class_name}`);
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

  const clearAutomaticRecognition = () => {
    // 保留原图和时间，仅清除自动识别写入的名单、文字和提示，方便立即重新识别。
    setStudentsText('');
    setOcrText('');
    setError(null);
  };
  const [recognizing, setRecognizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitKeyRef = useRef<string | null>(null);
  const [submittedLeaves, setSubmittedLeaves] = useState<SubmittedTemporaryLeave[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canStart = Boolean(user && (user.role === 'admin' || hasPermission(user, 'canStartGroupLeave')));

  const loadSubmittedLeaves = async () => {
    try {
      const response = await apiFetch('/api/leave-slips?self=1');
      const data = await response.json();
      if (data.success) setSubmittedLeaves((data.data || []).filter((item: SubmittedTemporaryLeave) => item.applicant_user_id === user?.id && item.slip_type === '其他请假' && item.leave_type === '临时请假'));
    } catch { setSubmittedLeaves([]); }
  };

  const startEdit = async (id: string) => {
    try {
      const response = await apiFetch(`/api/leave-slips?id=${encodeURIComponent(id)}`);
      const data = await response.json();
      const slip = data.success ? data.data?.[0] as SubmittedTemporaryLeave | undefined : undefined;
      if (!slip) throw new Error(data.error || '临时请假记录不存在');
      const rows = Array.isArray(data.students) ? data.students as ParsedStudent[] : [];
      const images = (() => { try { const parsed = JSON.parse(slip.image_list || '[]'); return Array.isArray(parsed) ? parsed.map((item: { url?: unknown; name?: unknown }) => ({ url: String(item.url || ''), name: String(item.name || '') })).filter((item: { url: string }) => item.url) : []; } catch { return []; } })();
      setEditingId(slip.id);
      setStudentsText(rows.map((row) => `${row.student_id} ${row.student_name} ${row.class_name}`).join('\n'));
      setStartTime(slip.start_time?.slice(0, 16) || '');
      setEndTime(slip.end_time?.slice(0, 16) || '');
      setUploadedImages(images.length ? images : (slip.leave_image_url ? [{ url: slip.leave_image_url, name: slip.leave_image_name || '临时请假图片' }] : []));
      setImageFiles([]);
      setPreviews((images.length ? images : (slip.leave_image_url ? [{ url: slip.leave_image_url, name: slip.leave_image_name || '临时请假图片' }] : [])).map((item: { url: string }) => item.url));
      setSuccess(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (editError) { setError(editError instanceof Error ? editError.message : '读取临时请假记录失败'); }
  };

  useEffect(() => { if (initialized && user && canStart) void loadSubmittedLeaves(); }, [canStart, initialized, user]);

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
    if (editingId) {
      setImageFiles(files);
      setUploadedImages([]);
      setPreviews([]);
    }
    setRecognizing(true);
    let imagesUploaded = false;
    try {
      const uploaded: UploadedImage[] = [];
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        body.append('purpose', 'group-leave');
        const response = await apiFetch('/api/upload', { method: 'POST', body });
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !(data as { success?: boolean }).success) throw new Error((data as { error?: string })?.error || '图片上传失败');
        const upload = data as { url?: unknown; file_name?: unknown };
        if (!upload.url) throw new Error('图片上传后未返回地址');
        uploaded.push({ url: String(upload.url), name: String(upload.file_name || file.name) });
      }
      setImageFiles((previous) => editingId ? files : [...previous, ...files]);
      setUploadedImages((previous) => editingId ? uploaded : [...previous, ...uploaded]);
      files.forEach((file) => { const reader = new FileReader(); reader.onload = () => setPreviews((previous) => [...previous, String(reader.result)]); reader.readAsDataURL(file); });
      imagesUploaded = true;
      // 复用前面已上传的文件，避免同一批图片重复写入服务器。
      const response = await apiFetch('/api/ocr/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrls: uploaded.map((item) => item.url) }) });
      const payload = await response.json() as OcrPayload;
      if (!payload.success) throw new Error(payload.error || '自动识别失败');
      const rows = formatOcrStudents(payload);
      // 重新自动识别时必须以本次图片结果覆盖旧识别内容。否则修复前误识别进来的
      // 辅导员会一直留在文本框内，即使服务端已经返回了正确的学生名单。
      if (rows.length) setStudentsText(rows.join('\n'));
      setOcrText(ocrLineTexts(payload.data?.lines).slice(0, 30).join('\n') || String(payload.data?.fields?.cover_line || ''));
      if (!rows.length) {
        const identifiedStudents = (Array.isArray(payload.data?.fields?.class_students)
          ? payload.data.fields.class_students.reduce((count, group) => count + stringList((group as OcrClassStudents)?.students).length, 0)
          : 0);
        setError(identifiedStudents
          ? `已识别 ${identifiedStudents} 名学生的姓名和班级，但原图“联系方式”列不含学号，且花名册未找到唯一对应学号，请补全后提交。`
          : '未能识别学生信息，请按“学号、姓名、班级”每行一名手工补全，三项顺序不限。');
      }
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
    if (!imageFiles.length && !uploadedImages.length) { setError('请上传临时请假图片'); return; }
    if (imageFiles.length && imageFiles.length !== uploadedImages.length) { setError('请等待图片上传完成后再提交'); return; }

    setSubmitting(true);
    try {
      const idempotencyKey = submitKeyRef.current || (submitKeyRef.current = createIdempotencyKey());
      const res = await apiFetch('/api/leave-slips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          slip_type: '其他请假',
          leave_type: '临时请假',
          submission_id: editingId,
          class_names: [...new Set(students.map((student) => student.class_name))],
          students,
          start_time: startTime,
          end_time: endTime,
          images: uploadedImages,
          ocr_names: students.map((student) => student.student_name),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '提交失败');
      const warningText = Array.isArray(data.warnings) && data.warnings.length ? `（${data.warnings.join('；')}）` : '';
      submitKeyRef.current = null;
      const attempt = Number(data.data?.submission_count || 1);
      setSuccess(`临时请假已提交，等待人工查对。${attempt > 1 ? `第 ${attempt} 次提交。` : ''}${warningText}`);
      setStudentsText('');
      setImageFiles([]);
      setUploadedImages([]);
      setPreviews([]);
      setOcrText('');
      setEditingId(null);
      await loadSubmittedLeaves();
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
          <h2 className="mt-2 text-2xl font-bold text-slate-950">临时请假</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">适用于临时性、跨班汇总的请假。提交后需经人工查对通过才会生效，请确保名单和图片真实有效。</p>
        </header>

        {success && <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{success}</span><Button type="button" variant="outline" className="border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100" onClick={() => setSuccess(null)}>重新提交</Button></div>}

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
            <span className="mt-1 block text-xs font-normal text-slate-500">名单可跨班；若原图只有“联系方式”而没有学号，系统会先填好姓名、班级并在行首留出学号位置，请直接补录学号。</span>
          </label>
          {ocrText && <label className="mt-4 block text-xs font-semibold text-slate-700">自动识别文字（含请假内容，最终以原图为准）<textarea value={ocrText} onChange={(event) => setOcrText(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-600" /></label>}
          <Button type="button" variant="outline" onClick={clearAutomaticRecognition} disabled={recognizing || !imageFiles.length} className="mt-3">清除自动识别数据</Button>

          <div className="mt-5">
            <Button type="button" onClick={() => void submit()} disabled={submitting || recognizing} className="bg-slate-950 hover:bg-slate-800">
              {submitting ? '提交中...' : recognizing ? '正在自动识别...' : editingId ? '重新提交，等待查对' : '提交，等待查对'}
            </Button>
          </div>
        </div>
        {submittedLeaves.length > 0 && (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-950">我的临时请假记录</h3>
            <p className="mt-1 text-xs text-slate-500">重新提交会覆盖原记录；已通过的记录不能覆盖。</p>
            <div className="mt-3 space-y-2">
              {submittedLeaves.map((leave) => <div key={leave.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5"><span className="text-sm font-medium text-slate-800">{leave.start_time?.slice(0, 16).replace('T', ' ') || '-'} 至 {leave.end_time?.slice(0, 16).replace('T', ' ') || '-'}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{leave.review_status}</span>{Number(leave.submission_count || 1) > 1 && <span className="text-xs text-amber-700">第 {leave.submission_count} 次提交</span>}<span className="ml-auto text-xs text-slate-400">{leave.created_at.slice(0, 16).replace('T', ' ')}</span>{leave.review_status !== '已通过' && <Button type="button" variant="outline" size="sm" onClick={() => void startEdit(leave.id)} className="border-teal-200 text-teal-700 hover:bg-teal-50">重新提交</Button>}</div>)}
            </div>
          </section>
        )}
      </div>

      <PageErrorDialog open={Boolean(error)} message={error} onClose={() => setError(null)} />
      <PageErrorDialog open={Boolean(success)} message={success} tone="success" onClose={() => setSuccess(null)} />
    </DashboardLayout>
  );
}
