'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Upload } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';

type ParsedStudent = { student_id: string; student_name: string; class_name: string };

function parseStudentLines(text: string, className: string): ParsedStudent[] {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const result: ParsedStudent[] = [];
  for (const line of lines) {
    const idMatch = line.match(/\d{8,11}/);
    if (!idMatch) continue;
    const studentId = idMatch[0];
    const name = line.replace(studentId, '').replace(/[,，、\s]+/g, '').trim();
    if (!/^[\u4e00-\u9fff]{2,6}$/.test(name)) continue;
    result.push({ student_id: studentId, student_name: name, class_name: className });
  }
  return result;
}

export default function TemporaryLeavePage() {
  const { user, initialized } = useUser();
  const [className, setClassName] = useState('');
  const [studentsText, setStudentsText] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUpload = Boolean(user && (user.role === 'admin' || user.canUploadLeave === true));
  const canChooseClass = Boolean(user && (user.role === 'admin' || user.role === 'leader'));

  useEffect(() => {
    if (user?.className) setClassName(user.className);
  }, [user?.className]);

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) {
    return (
      <DashboardLayout user={user} title="临时请假" activeNavHref="/leave-slip/temporary">
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">请先登录。</div>
      </DashboardLayout>
    );
  }
  if (!canUpload) {
    return (
      <DashboardLayout user={user} title="临时请假" activeNavHref="/leave-slip/temporary">
        <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="font-semibold text-amber-900">当前账号没有临时请假提交权限</h2>
          <p className="mt-2 text-sm text-amber-800">请联系系统管理员授予 `canUploadLeave` 权限。</p>
        </div>
      </DashboardLayout>
    );
  }

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setImageFiles((previous) => [...previous, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPreviews((previous) => [...previous, String(reader.result)]);
      reader.readAsDataURL(file);
    });
  };

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!className.trim()) { setError('请填写班级'); return; }
    if (!startTime || !endTime) { setError('请选择开始和结束时间'); return; }
    if (endTime <= startTime) { setError('结束时间必须晚于开始时间'); return; }
    const students = parseStudentLines(studentsText, className.trim());
    if (!students.length) { setError('请至少填写一名学生，格式：学号 姓名（每行一个）'); return; }
    if (!imageFiles.length) { setError('请上传临时请假图片'); return; }

    setSubmitting(true);
    try {
      const uploaded: Array<{ url: string; name: string }> = [];
      for (const file of imageFiles) {
        const body = new FormData();
        body.append('file', file);
        const uploadRes = await apiFetch('/api/upload', { method: 'POST', body });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) throw new Error(uploadData.error || '图片上传失败');
        uploaded.push({ url: String(uploadData.url), name: String(uploadData.file_name || file.name) });
      }
      const res = await apiFetch('/api/leave-slips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slip_type: '其他请假',
          leave_type: '临时请假',
          class_names: [className.trim()],
          students,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          images: uploaded,
          ocr_names: students.map((student) => student.student_name),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '提交失败');
      const warningText = Array.isArray(data.warnings) && data.warnings.length ? `（${data.warnings.join('；')}）` : '';
      setSuccess(`临时请假已提交并通过自动审核，立即生效。${warningText}`);
      setStudentsText('');
      setImageFiles([]);
      setPreviews([]);
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

        {error && <div role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {success && <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /><p>{success}</p></div>}

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">班级
              <input value={className} onChange={(event) => setClassName(event.target.value)} disabled={!canChooseClass} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500" placeholder="例如：计算机2101" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">结束时间
              <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">开始时间
              <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">请假学生（每行：学号 姓名）
              <textarea value={studentsText} onChange={(event) => setStudentsText(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder={'2024010101 张三\n2024010102 李四'} />
            </label>
          </div>

          <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition-colors hover:border-teal-400 hover:bg-teal-50/40">
            <span className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-slate-200"><Upload className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{imageFiles.length ? `已选 ${imageFiles.length} 张图片` : '选择临时请假图片（可多张截图）'}</span><span className="mt-0.5 block text-xs text-slate-500">支持常见图片格式，单张不超过 5MB</span></span>
              <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">选择文件</span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={handleImageChange} aria-label="临时请假图片，可多选" />
            </span>
          </label>
          {previews.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{previews.map((preview, index) => <img key={`${preview.slice(0, 32)}-${index}`} src={preview} alt={`预览 ${index + 1}`} className="size-24 rounded-md border border-slate-200 object-contain" />)}</div>}

          <div className="mt-5">
            <Button type="button" onClick={() => void submit()} disabled={submitting} className="bg-slate-950 hover:bg-slate-800">
              {submitting ? '提交中...' : '提交并通过自动审核'}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}