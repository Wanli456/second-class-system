'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, FileCheck2, Plus, ScanText, Send, Trash2, Upload } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StudentRow { student_id: string; student_name: string; class_name: string; }
interface ActivityOption { id: string; full_name: string; }

const SLIP_TYPES = [
  { value: '手写假条', description: '严格按模板填写，必须有辅导员签字', icon: FileCheck2 },
  { value: '二课活动请假', description: '活动方提供的假条，必须有公章和老师签字', icon: FileCheck2 },
  { value: '校级（且不为数经举办）假条', description: '其他学院举办的校级活动，需上传假条截图和到梦空间“等待活动”手机截图', icon: FileCheck2 },
  { value: '手机假条', description: '手机上的请假/审批截图，请假类型可选事假、病假、活动公假', icon: FileCheck2 },
] as const;

const LEAVE_TYPES = ['事假', '病假', '活动公假'] as const;

export default function LeaveSlipUploadPage() {
  const router = useRouter();
  const { user, initialized } = useUser();
  const [slipType, setSlipType] = useState<(typeof SLIP_TYPES)[number]['value']>('手写假条');
  const [leaveType, setLeaveType] = useState('事假');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [activityId, setActivityId] = useState('');
  const [activityName, setActivityName] = useState('');
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrLines, setOcrLines] = useState<Array<{ text: string; score?: number; image?: number }>>([]);
  const [counselorSignature, setCounselorSignature] = useState(false);
  const [officialSeal, setOfficialSeal] = useState(false);
  const [teacherSignature, setTeacherSignature] = useState(false);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAccess = user?.role === 'admin' || user?.canUploadLeave === true;

  useEffect(() => {
    if (!user || !canAccess) return;
    setStudents([{ student_id: '', student_name: '', class_name: user.className || '' }]);
  }, [user, canAccess]);

  useEffect(() => {
    if (slipType !== '二课活动请假' && leaveType !== '活动公假') return;
    apiFetch('/api/activities?purpose=leave').then((res) => res.json()).then((data) => {
      if (data.success) setActivityOptions(data.data || []);
    }).catch(() => {});
  }, [leaveType, slipType]);

  const activityOptionsFiltered = useMemo(() => {
    return activityOptions.slice(0, 100);
  }, [activityOptions]);

  const addStudent = () => setStudents((list) => [...list, { student_id: '', student_name: '', class_name: user?.className || '' }]);
  const removeStudent = (index: number) => setStudents((list) => list.filter((_, i) => i !== index));
  const updateStudent = (index: number, patch: Partial<StudentRow>) => setStudents((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const allFiles = [...imageFiles, ...files];
    setImageFiles(allFiles);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setImagePreviews((previous) => [...previous, String(reader.result)]);
      reader.readAsDataURL(file);
    });
    // 选完图片就自动识别，所有假条类型都走同一个 AI/OCR 入口。
    void runOcrForFiles(allFiles);
  };

  const uploadFilesToUrls = async (files: File[]) => {
    const uploaded: Array<{ url: string; name: string }> = [];
    for (const file of files) {
      const body = new FormData();
      body.append('file', file);
      const uploadRes = await apiFetch('/api/upload', { method: 'POST', body });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) throw new Error(uploadData.error || '图片上传失败');
      uploaded.push({ url: String(uploadData.url), name: String(uploadData.file_name || file.name) });
    }
    return uploaded;
  };

  const runOcrForFiles = async (files: File[]) => {
    if (!files.length) return;
    setOcrError('');
    setOcrLoading(true);
    setOcrLines([]);
    try {
      const uploaded = await uploadFilesToUrls(files);
      const res = await apiFetch('/api/ocr/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: uploaded.map((item) => item.url) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'OCR 识别失败');

      const fields = data.data.fields || {};
      const names: string[] = Array.isArray(fields.students) ? fields.students.map(String) : [];
      if (names.length) {
        setStudents((previous) => {
          const existingNames = new Set(previous.map((row) => row.student_name.trim()).filter(Boolean));
          const rows = previous.filter((row) => row.student_id.trim() || row.student_name.trim());
          const added = names.filter((name) => !existingNames.has(name) && name.length >= 2).map((name) => ({ student_id: '', student_name: name, class_name: user?.className || '' }));
          return [...rows, ...added];
        });
      }
      if (slipType === '二课活动请假' && fields.activity_name && !activityName) setActivityName(String(fields.activity_name));
      if (fields.start_time && String(fields.start_time).length >= 16) setStartTime(String(fields.start_time).slice(0, 16));
      if (fields.end_time && String(fields.end_time).length >= 16) setEndTime(String(fields.end_time).slice(0, 16));
      setOcrLines(Array.isArray(data.data.lines) ? data.data.lines : []);
      setError(null);
    } catch (ocrSubmitError) {
      setOcrError(ocrSubmitError instanceof Error ? ocrSubmitError.message : 'OCR 识别失败');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleOcr = async () => {
    if (!imageFiles.length) { setError('请先上传假条图片'); return; }
    await runOcrForFiles(imageFiles);
  };

  const handleSubmit = async () => {
    setError(null);
    const cleanedStudents = students.filter((student) => student.student_id.trim() && student.student_name.trim() && student.class_name.trim());
    if (!cleanedStudents.length) { setError('请至少填写一名学生的学号、姓名和班级'); return; }
    if (cleanedStudents.some((student) => !student.student_id.trim() || !student.student_name.trim() || !student.class_name.trim())) { setError('学生信息不完整：学号、姓名、班级都要填写'); return; }
    if (!startTime || !endTime) { setError('请填写请假开始和结束时间'); return; }
    if (new Date(endTime) <= new Date(startTime)) { setError('结束时间必须晚于开始时间'); return; }
    if (!imageFiles.length) { setError('请上传假条图片（可多选截图）'); return; }
    if (slipType === '校级（且不为数经举办）假条' && imageFiles.length < 2) {
      setError('校级（且不为数经举办）假条必须同时上传：假条截图 + 到梦空间“等待活动”手机截图，共至少 2 张');
      return;
    }
    if (slipType === '手写假条' && !counselorSignature) { setError('手写假条必须有辅导员签字'); return; }
    if (slipType === '二课活动请假') {
      if (!officialSeal || !teacherSignature) { setError('二课活动请假必须有公章和老师签字'); return; }
      if (!activityId) { setError('二课活动假条一次只能关联一个活动，请先选择活动'); return; }
    }

    setSubmitting(true);
    try {
      const uploaded = await uploadFilesToUrls(imageFiles);

      const response = await apiFetch('/api/leave-slips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slip_type: slipType,
          leave_type: leaveType,
          students: cleanedStudents,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          activity_id: slipType === '二课活动请假' ? activityId : null,
          activity_name: slipType === '二课活动请假' ? activityOptions.find((activity) => activity.id === activityId)?.full_name || activityName : null,
          images: uploaded,
          leave_image_url: uploaded[0]?.url || null,
          leave_image_name: uploaded[0]?.name || null,
          ocr_names: cleanedStudents.map((student) => student.student_name),
          counselor_signature: counselorSignature,
          official_seal: officialSeal,
          teacher_signature: teacherSignature,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '提交失败');
      const autoMessage = data.auto_match?.action === 'rejected'
        ? '，系统已自动驳回'
        : data.auto_match?.action === 'manual'
          ? '，文字名单与原假条一致，待人工核对照片'
          : '';
      setSuccess(`${data.warnings?.length ? data.warnings.join('；') : '假条已提交'}${autoMessage}`);
      setImageFiles([]);
      setImagePreviews([]);
      setStartTime('');
      setEndTime('');
      setStudents([{ student_id: '', student_name: '', class_name: user?.className || '' }]);
      setCounselorSignature(false);
      setOfficialSeal(false);
      setTeacherSignature(false);
      window.setTimeout(() => router.push('/leave-slip/query'), 1500);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><div className="rounded-xl border bg-white p-6 text-center"><h2 className="font-semibold">请先登录</h2><p className="mt-2 text-sm text-slate-500">登录后才能上传假条。</p><Link href="/login?redirect=/leave-slip/upload" className="mt-4 inline-block rounded-md bg-slate-950 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;
  if (!canAccess) {
    return (
      <DashboardLayout user={user} title="假条上传" activeNavHref="/leave-slip/upload">
        <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertCircle className="mx-auto size-6 text-amber-600" />
          <h2 className="mt-3 font-semibold text-amber-900">当前账号没有假条上传权限</h2>
          <p className="mt-2 text-sm text-amber-800">请联系系统管理员授予 `canUploadLeave` 权限。</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user} title="假条上传" activeNavHref="/leave-slip/upload">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase text-teal-700">假条管理</p>
          <h2 className="mt-2 text-2xl font-bold text-balance text-slate-950">上传请假假条</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-pretty text-slate-600">由班级负责人统一上传本班假条，18:30 后上传会自动标记为迟到假条。</p>
        </header>

        {error && <div role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {success && <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /><p>{success}，即将跳转到查询页</p></div>}

        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-semibold text-slate-950"><span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">1</span>假条类型</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SLIP_TYPES.map((type) => (
                <label key={type.value} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors', slipType === type.value ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600' : 'border-slate-200 bg-white hover:border-slate-300')}>
                  <input type="radio" className="peer sr-only" checked={slipType === type.value} onChange={() => { setSlipType(type.value); if (type.value === '二课活动请假' || type.value === '校级（且不为数经举办）假条') { setLeaveType('活动公假'); setCounselorSignature(false); } }} />
                  <type.icon className={cn('size-5', slipType === type.value ? 'text-teal-700' : 'text-slate-400')} />
                  <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{type.value}</span><span className="mt-0.5 block text-xs text-pretty text-slate-500">{type.description}</span></span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-semibold text-slate-950"><span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">2</span>请假时间</legend>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">请假类型
                <select value={leaveType} disabled={slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条'} onChange={(event) => setLeaveType(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500">
                  {slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条' ? <option value="活动公假">活动公假（固定）</option> : LEAVE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                {(slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条') && <span className="mt-1 block text-[11px] text-slate-500">该假条类型只允许“活动公假”</span>}
              </label>
              {slipType === '二课活动请假' && (
                <label className="block text-xs font-semibold text-slate-600">关联活动（一次只能选择一个活动）
                  <input list="leave-slip-activity-options" value={activityName} onChange={(event) => { setActivityName(event.target.value); const match = activityOptions.find((item) => item.full_name === event.target.value || item.id === event.target.value); setActivityId(match?.id || ''); }} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="输入活动名称或ID，一次一种活动" />
                  <datalist id="leave-slip-activity-options">{activityOptionsFiltered.map((activity) => <option key={activity.id} value={activity.full_name}>{activity.id}</option>)}</datalist>
                </label>
              )}
              <label className="block text-xs font-semibold text-slate-600">开始时间
                <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label className="block text-xs font-semibold text-slate-600">结束时间
                <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-semibold text-slate-950"><span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">3</span>请假学生</legend>
            <div className="mt-4 space-y-3">
              {students.map((student, index) => (
                <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input aria-label="学生学号" placeholder="学号" value={student.student_id} onChange={(event) => updateStudent(index, { student_id: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600" />
                  <input aria-label="学生姓名" placeholder="姓名" value={student.student_name} onChange={(event) => updateStudent(index, { student_name: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600" />
                  <input aria-label="学生班级" placeholder="班级" value={student.class_name} onChange={(event) => updateStudent(index, { class_name: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeStudent(index)} disabled={students.length === 1} aria-label={`删除第${index + 1}名学生`}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addStudent}><Plus className="size-4" />添加学生</Button>
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-semibold text-slate-950"><span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">4</span>假条图片与核验项</legend>
            {slipType === '校级（且不为数经举办）假条' && (
              <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">该类型为其他学院举办的校级活动，不关联本系统活动，请假类型固定为活动公假；必须同时上传：<strong>① 假条截图</strong>（带公章）和 <strong>② 到梦空间“等待活动”手机截图</strong>；至少 2 张。</p>
            )}
            {slipType === '手机假条' && (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">请上传手机上的请假/审批记录截图（至少 1 张），请假类型可选择<strong>事假、病假、活动公假</strong>；该类型不关联系统活动。</p>
            )}
            <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition-colors hover:border-teal-400 hover:bg-teal-50/40">
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-slate-200"><Upload className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{imageFiles.length ? `已选 ${imageFiles.length} 张图片` : '选择假条图片（同一张假条的多段截图可一次全选）'}</span><span className="mt-0.5 block text-xs text-slate-500">支持常见图片格式，单张不超过 5MB</span></span>
                <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">选择文件</span>
                <input type="file" accept="image/*" multiple className="sr-only" onChange={handleImageChange} aria-label="假条图片，可多选" />
              </span>
            </label>
            {imagePreviews.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {imagePreviews.map((preview, index) => <img key={`${preview.slice(0, 32)}-${index}`} src={preview} alt={`假条预览 ${index + 1}`} className="size-24 rounded-md border border-slate-200 object-contain" />)}
              </div>
            )}
            <>
              <Button type="button" variant="outline" onClick={handleOcr} disabled={ocrLoading || !imageFiles.length} className="mt-3 w-full bg-white disabled:opacity-50"><ScanText className="size-4" />{ocrLoading ? '自动识别中...' : '自动识别假条内容（也可点击重试）'}</Button>
              {ocrError && <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{ocrError}（识别失败可手动填写，不影响提交）</p>}
              {ocrLines.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">自动识别到的人员/内容（已自动填入下方名单，请补学号并核对）</p>
                  <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-5 text-amber-800">原图可能包含多个班级的同学。提交时只保留<strong>本班学生</strong>，把其他班级的同学从下方名单中删除后再提交。</p>
                  <div className="max-h-32 space-y-1 overflow-auto">
                    {ocrLines.map((line, index) => <p key={`${line.text}-${index}`} className="text-xs leading-5 text-slate-700">{line.text}</p>)}
                  </div>
                </div>
              )}
            </>

            {slipType === '手写假条' ? (
              <label className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <input type="checkbox" checked={counselorSignature} onChange={(event) => setCounselorSignature(event.target.checked)} className="size-4 rounded border-slate-300 text-teal-700 accent-teal-700" />
                <span className="text-sm text-slate-700">已核对：假条上<strong className="text-slate-950">辅导员签字</strong>齐全且格式按照模板填写</span>
              </label>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={officialSeal} onChange={(event) => setOfficialSeal(event.target.checked)} className="size-4 rounded border-slate-300 text-teal-700 accent-teal-700" />
                  <span className="text-sm text-slate-700">已核对：<strong className="text-slate-950">公章</strong>齐全</span>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={teacherSignature} onChange={(event) => setTeacherSignature(event.target.checked)} className="size-4 rounded border-slate-300 text-teal-700 accent-teal-700" />
                  <span className="text-sm text-slate-700">已核对：<strong className="text-slate-950">老师签字</strong>齐全</span>
                </label>
              </div>
            )}
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
            <Button type="button" onClick={handleSubmit} disabled={submitting} className="h-11 bg-slate-950 px-5 hover:bg-slate-800"><Send className="size-4" />{submitting ? '提交中...' : '提交假条'}</Button>
            <Button type="button" variant="outline" asChild className="h-11 bg-white px-5"><Link href="/leave-slip/mine">查看已提交假条</Link></Button>
            <p className="text-xs text-slate-500 sm:ml-auto">上传后由考勤组长查对</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}