'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, FileCheck2, Minus, Plus, ScanText, Send, Trash2, Upload, X } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { PageErrorDialog } from '@/components/PageErrorDialog';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface StudentRow { student_id: string; student_name: string; class_name: string; }
interface ActivityOption { id: string; full_name: string; }

const SLIP_TYPES = [
  { value: '手写假条', description: '严格按模板填写，必须有辅导员签字', icon: FileCheck2 },
  { value: '二课活动请假', description: '活动方提供的假条，必须有公章和老师签字', icon: FileCheck2 },
  { value: '校级（且不为数经举办）假条', description: '其他学院举办的校级活动，需上传假条截图和到梦空间“等待活动”手机截图', icon: FileCheck2 },
  { value: '手机假条', description: '手机上的请假/审批截图，请假类型可选事假、病假、活动公假', icon: FileCheck2 },
  { value: '其他请假', description: '社团、比赛、培训、虚拟工作室等，上传相关请假/通知截图', icon: FileCheck2 },
] as const;

const LEAVE_TYPES = ['事假', '病假', '活动公假'] as const;
const OTHER_LEAVE_TYPES = ['社团', '比赛', '培训', '虚拟工作室'] as const;

function FieldBadge({ kind, label }: { kind: 'auto' | 'manual'; label?: string }) {
  if (kind === 'auto') {
    return <span className="ml-1 inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">{label || '自动识别'}</span>;
  }
  return <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{label || '需手填/手选'}</span>;
}

function normalizeClassName(value: string): string {
  return value.replace(/\s+/g, '').replace(/班$/g, '');
}

function isSubsequence(shortText: string, fullText: string): boolean {
  let index = 0;
  for (const char of fullText) {
    if (shortText[index] === char) index += 1;
    if (index === shortText.length) return true;
  }
  return index === shortText.length;
}

function classTextMatches(recognized: string | null | undefined, official: string | null | undefined): boolean {
  const normalizedRecognized = normalizeClassName(String(recognized || ''));
  const normalizedOfficial = normalizeClassName(String(official || ''));
  if (!normalizedRecognized || !normalizedOfficial) return false;
  if (normalizedRecognized === normalizedOfficial) return true;
  if (normalizedOfficial.includes(normalizedRecognized) || normalizedRecognized.includes(normalizedOfficial)) return true;
  const recognizedNumber = normalizedRecognized.match(/(\d+)$/)?.[1] || '';
  const officialNumber = normalizedOfficial.match(/(\d+)$/)?.[1] || '';
  if (recognizedNumber && recognizedNumber === officialNumber) {
    const recognizedPrefix = normalizedRecognized.slice(0, -recognizedNumber.length);
    const officialPrefix = normalizedOfficial.slice(0, -officialNumber.length);
    if (!recognizedPrefix || !officialPrefix) return true;
    if (isSubsequence(recognizedPrefix, officialPrefix)) return true;
  }
  return false;
}

export default function LeaveSlipUploadPage() {
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrLines, setOcrLines] = useState<Array<{ text: string; score?: number; image?: number }>>([]);
  const [ocrNotice, setOcrNotice] = useState('');
  const [counselorSignature, setCounselorSignature] = useState(false);
  const [officialSeal, setOfficialSeal] = useState(false);
  const [teacherSignature, setTeacherSignature] = useState(false);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAccess = hasPermission(user, 'canUploadLeave');
  const canChooseClass = Boolean(user && (user.role === 'admin' || user.role === 'leader'));

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
    // 清空原生 input，避免选择完成后浏览器聚焦隐藏 input 导致页面滚动/高度异常。
    event.target.value = '';
    if (!files.length) return;
    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      setError('单张假条图片不能超过 5MB');
      return;
    }
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

  const removeImage = (index: number) => {
    setImageFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setImagePreviews((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setOcrLines([]);
    setOcrError('');
    setOcrNotice('');
  };

  const openImagePreview = (src: string) => {
    setPreviewZoom(1);
    setPreviewImage(src);
  };

  const closeImagePreview = () => {
    setPreviewImage(null);
    setPreviewZoom(1);
  };

  const zoomImageBy = (delta: number) => setPreviewZoom((current) => Math.min(4, Math.max(1, Number((current + delta).toFixed(2)))));

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
      const classes: string[] = Array.isArray(fields.classes) ? fields.classes.map(String) : [];
      const classStudents: Array<{ class_name: string; students?: unknown; student_ids?: unknown }> = Array.isArray(fields.class_students) ? fields.class_students as Array<{ class_name: string; students?: unknown; student_ids?: unknown }> : [];
      const currentClass = (user?.className || '').replace(/\s+/g, '');
      const recognizedClasses = classes.map((item) => item.replace(/\s+/g, '')).filter(Boolean);

      const matchedClassEntry = classStudents.find((entry) => classTextMatches(entry.class_name, currentClass));
      const matchedNames: string[] = Array.isArray(matchedClassEntry?.students) ? matchedClassEntry.students.map(String) : [];
      const matchedIds: string[] = Array.isArray(matchedClassEntry?.student_ids) ? matchedClassEntry.student_ids.map(String) : [];
      const studentsToFill = matchedNames.length ? matchedNames : names;
      const shouldUseMatchedIds = Boolean(matchedClassEntry) && matchedIds.length === studentsToFill.length;
      const singleClassMatches = recognizedClasses.length === 1 && classTextMatches(recognizedClasses[0], currentClass);
      const shouldAutoFill = Boolean(currentClass)
        && (matchedClassEntry ? matchedNames.length > 0 : singleClassMatches);

      if (recognizedClasses.length > 1) {
        setOcrNotice(
          matchedClassEntry
            ? `识别到多个班级（${classes.join('、')}），已自动只把本班「${matchedClassEntry.class_name}」的同学填入下方名单${shouldUseMatchedIds ? '，姓名和学号一起填入' : '，学号请手填'}，请核对。`
            : `识别到多个班级（${classes.join('、')}），但没有识别到本班「${user?.className || '未设置班级'}」，请手动填写本班同学。`,
        );
      } else if (recognizedClasses.length === 1 && currentClass && singleClassMatches) {
        setOcrNotice(`识别到本班「${classes[0]}」的同学，已自动填入下方名单${shouldUseMatchedIds ? '（姓名和学号）' : ''}，请核对后补全学号。`);
      } else if (recognizedClasses.length === 1) {
        setOcrNotice(`图片识别到的是「${classes[0]}」，但当前账号是「${user?.className || '未设置班级'}」，为避免填错班，系统没有自动填入，请手动填写。`);
      } else {
        setOcrNotice(`图片里没有识别到明确班级，请手动填写本班「${user?.className || ''}」的同学。`);
      }

      if (shouldAutoFill && studentsToFill.length) {
        setStudents((previous) => {
          const existingNames = new Set(previous.map((row) => row.student_name.trim()).filter(Boolean));
          const rows = previous.filter((row) => row.student_id.trim() || row.student_name.trim());
          const added = studentsToFill.map((name, index) => ({ student_id: shouldUseMatchedIds ? matchedIds[index] || '' : '', student_name: name, class_name: user?.className || '' })).filter((row) => !existingNames.has(row.student_name) && row.student_name.length >= 2);
          return [...rows, ...added];
        });
      }
      if (slipType === '二课活动请假' && fields.activity_name && !activityName) {
        const recognizedActivity = String(fields.activity_name);
        setActivityName(recognizedActivity);
        const exactActivity = activityOptions.find((item) => item.full_name === recognizedActivity || item.id === recognizedActivity);
        if (exactActivity?.id) setActivityId(exactActivity.id);
      }
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
    setSuccess(null);
    setError(null);
    const cleanedStudents = students.filter((student) => student.student_id.trim() && student.student_name.trim() && student.class_name.trim());
    if (!cleanedStudents.length) { setError('请至少填写一名学生的学号、姓名和班级'); return; }
    if (cleanedStudents.some((student) => !student.student_id.trim() || !student.student_name.trim() || !student.class_name.trim())) { setError('学生信息不完整：学号、姓名、班级都要填写'); return; }
    if (!canChooseClass && cleanedStudents.some((student) => student.class_name.trim() !== user?.className)) {
      setError(`当前账号只能提交本班（${user?.className || '未设置班级'}）的假条`); return;
    }
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
      let data: { success?: boolean; error?: unknown };
      try {
        data = await response.json() as { success?: boolean; error?: unknown };
      } catch {
        throw new Error(response.ok ? '服务器返回异常，请稍后重试' : `服务器响应异常（HTTP ${response.status}）`);
      }
      if (!response.ok || !data.success) {
        throw new Error(typeof data.error === 'string' && data.error ? data.error : `提交失败（HTTP ${response.status}）`);
      }
      setSuccess('假条提交成功，当前状态：待查对');
      setImageFiles([]);
      setImagePreviews([]);
      setStartTime('');
      setEndTime('');
      setStudents([{ student_id: '', student_name: '', class_name: user?.className || '' }]);
      setCounselorSignature(false);
      setOfficialSeal(false);
      setTeacherSignature(false);
    } catch (submitError) {
      const message = submitError instanceof Error && submitError.message ? submitError.message : '未知原因，请稍后重试';
      const isNetworkError = submitError instanceof TypeError && /network|fetch|load/i.test(message);
      setError(isNetworkError ? '假条提交失败：网络连接异常，请检查网络后重试' : `假条提交失败：${message}`);
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

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-950">哪些能自动识别，哪些要手填？</p>
          <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
            <li className="flex flex-wrap items-center gap-y-1">
              <FieldBadge kind="auto" />
              <span className="ml-2">上传图片后自动识别：<strong>学生姓名、学生班级、开始时间、结束时间</strong>；图片里出现学号时也会自动识别<strong>学号</strong>；“二课活动请假”还会自动识别<strong>活动名称</strong>（仅作候选，请确认）。识别结果都可以手动改，提交前请核对。</span>
            </li>
            <li className="flex flex-wrap items-center gap-y-1">
              <FieldBadge kind="manual" />
              <span className="ml-2">必须手填或手选：<strong>假条类型、请假类型、关联活动、公章/老师签字/辅导员签字</strong>的核对勾选；<strong>图片</strong>也需要手动选择上传。<strong>图片里没有学号时，学号只能手填。</strong></span>
            </li>
          </ul>
        </div>

        {success && <div role="status" className="sr-only">{success}</div>}

        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-semibold text-slate-950"><span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">1</span>假条类型</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SLIP_TYPES.map((type) => (
                <label key={type.value} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors', slipType === type.value ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600' : 'border-slate-200 bg-white hover:border-slate-300')}>
                  <input type="radio" className="peer sr-only" checked={slipType === type.value} onChange={() => { setSlipType(type.value); setCounselorSignature(false); if (type.value === '二课活动请假' || type.value === '校级（且不为数经举办）假条') { setLeaveType('活动公假'); } else if (type.value === '其他请假') { setLeaveType('社团'); } else { setLeaveType('事假'); } }} />
                  <type.icon className={cn('size-5', slipType === type.value ? 'text-teal-700' : 'text-slate-400')} />
                  <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{type.value}</span><span className="mt-0.5 block text-xs text-pretty text-slate-500">{type.description}</span></span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-semibold text-slate-950"><span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">2</span>请假时间</legend>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">请假类型{(slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条') ? <FieldBadge kind="auto" label="固定" /> : <FieldBadge kind="manual" />}
                <select value={leaveType} disabled={slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条'} onChange={(event) => setLeaveType(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500">
                  {slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条' ? <option value="活动公假">活动公假（固定）</option> : (slipType === '其他请假' ? OTHER_LEAVE_TYPES : LEAVE_TYPES).map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                {(slipType === '二课活动请假' || slipType === '校级（且不为数经举办）假条') && <span className="mt-1 block text-[11px] text-slate-500">该假条类型只允许“活动公假”</span>}
              </label>
              {slipType === '二课活动请假' && (
                <label className="block text-xs font-semibold text-slate-600">关联活动（一次只能选择一个活动）<FieldBadge kind="manual" />
                  <input list="leave-slip-activity-options" value={activityName} onChange={(event) => { setActivityName(event.target.value); const match = activityOptions.find((item) => item.full_name === event.target.value || item.id === event.target.value); setActivityId(match?.id || ''); }} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="输入活动名称或ID，一次一种活动" />
                  <datalist id="leave-slip-activity-options">{activityOptionsFiltered.map((activity) => <option key={activity.id} value={activity.full_name}>{activity.id}</option>)}</datalist>
                </label>
              )}
              <label className="block text-xs font-semibold text-slate-600">开始时间<FieldBadge kind="auto" />
                <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label className="block text-xs font-semibold text-slate-600">结束时间<FieldBadge kind="auto" />
                <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-semibold text-slate-950"><span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">3</span>请假学生</legend>
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-800">姓名、班级</span>：上传图片后自动识别填入（可手改）；<span className="font-semibold text-slate-800">学号</span>：图片里有学号会自动填入，<strong>提交前必须核对</strong>；没有识别到就手填。<span className="ml-2 inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">姓名自动</span><span className="ml-1 inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">学号可自动</span></p>
            <div className="mt-4 space-y-3">
              {students.map((student, index) => (
                <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input aria-label="学生学号" placeholder="学号" value={student.student_id} onChange={(event) => updateStudent(index, { student_id: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600" />
                  <input aria-label="学生姓名" placeholder="姓名" value={student.student_name} onChange={(event) => updateStudent(index, { student_name: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600" />
                  <input aria-label="学生班级" placeholder="班级" value={student.class_name} onChange={(event) => updateStudent(index, { class_name: event.target.value })} disabled={!canChooseClass} className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600 ${!canChooseClass ? 'bg-slate-50 text-slate-500' : ''}`} />
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
            {slipType === '其他请假' && (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">请上传社团、比赛、培训、虚拟工作室等相关截图（至少 1 张）；请假类型可选<strong>社团、比赛、培训、虚拟工作室</strong>；该类型不关联系统活动。</p>
            )}
            <label className="relative mt-4 block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition-colors hover:border-teal-400 hover:bg-teal-50/40">
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-slate-200"><Upload className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{imageFiles.length ? `已选 ${imageFiles.length} 张图片` : '选择假条图片（同一张假条的多段截图可一次全选）'}</span><span className="mt-0.5 block text-xs text-slate-500">支持常见图片格式，单张不超过 5MB</span></span>
                <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">选择文件</span>
                <input type="file" accept="image/*" multiple className="sr-only" onChange={handleImageChange} aria-label="假条图片，可多选" />
              </span>
            </label>
            {imagePreviews.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {imagePreviews.map((preview, index) => (
                  <div key={`${preview.slice(0, 32)}-${index}`} className="relative">
                    <img
                      src={preview}
                      alt={`假条预览 ${index + 1}`}
                      onClick={() => openImagePreview(preview)}
                      className="size-24 cursor-zoom-in rounded-md border border-slate-200 object-contain hover:border-teal-500 hover:ring-2 hover:ring-teal-100"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      aria-label={`删除第 ${index + 1} 张假条图片`}
                      title="删除图片"
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-slate-900 text-white shadow hover:bg-rose-600"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <>
              <Button type="button" variant="outline" onClick={handleOcr} disabled={ocrLoading || !imageFiles.length} className="mt-3 w-full bg-white disabled:opacity-50"><ScanText className="size-4" />{ocrLoading ? '自动识别中...' : '自动识别假条内容（也可点击重试）'}</Button>
              {ocrError && <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{ocrError}（识别失败可手动填写，不影响提交）</p>}
              {ocrLines.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">自动识别到的人员/内容</p>
                  {ocrNotice && <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-5 text-amber-800">{ocrNotice}</p>}
                  <div className="max-h-32 space-y-1 overflow-auto">
                    {ocrLines.map((line, index) => <p key={`${line.text}-${index}`} className="text-xs leading-5 text-slate-700">{line.text}</p>)}
                  </div>
                </div>
              )}
            </>

            {slipType === '手写假条' ? (
              <div className="mt-4">
                <p className="mb-2 text-xs text-slate-500">以下为人工核对后手动勾选，OCR 识别结果仅供参考。</p>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={counselorSignature} onChange={(event) => setCounselorSignature(event.target.checked)} className="size-4 rounded border-slate-300 text-teal-700 accent-teal-700" />
                  <span className="text-sm text-slate-700">已核对：假条上<strong className="text-slate-950">辅导员签字</strong>齐全且格式按照模板填写</span>
                </label>
              </div>
            ) : (
              <div className="mt-4">
                <p className="mb-2 text-xs text-slate-500">以下为人工核对后手动勾选，OCR 识别结果仅供参考。</p>
                <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={officialSeal} onChange={(event) => setOfficialSeal(event.target.checked)} className="size-4 rounded border-slate-300 text-teal-700 accent-teal-700" />
                  <span className="text-sm text-slate-700">已核对：<strong className="text-slate-950">公章</strong>齐全</span>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={teacherSignature} onChange={(event) => setTeacherSignature(event.target.checked)} className="size-4 rounded border-slate-300 text-teal-700 accent-teal-700" />
                  <span className="text-sm text-slate-700">已核对：<strong className="text-slate-950">老师签字</strong>齐全</span>
                </label>
              </div>
              </div>
            )}
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
            <Button type="button" onClick={handleSubmit} disabled={submitting} className="h-11 bg-slate-950 px-5 hover:bg-slate-800"><Send className="size-4" />{submitting ? '提交中...' : '提交假条'}</Button>
            <Button type="button" variant="outline" asChild className="h-11 bg-white px-5"><Link href="/leave-slip/mine">查看已提交假条</Link></Button>
            <p className="text-xs text-slate-500 sm:ml-auto">上传后由考勤组长查对</p>
          </div>
        </div>

        <Dialog open={Boolean(previewImage)} onOpenChange={(open) => { if (!open) closeImagePreview(); }}>
          <DialogContent
            showCloseButton={false}
            className="w-fit max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-0 sm:max-w-[calc(100vw-2rem)]"
          >
            <DialogTitle className="sr-only">假条图片放大预览</DialogTitle>
            <div className="relative max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-auto">
              <div style={{ zoom: previewZoom }}>
                {previewImage && (
                  <img
                    src={previewImage}
                    alt="假条图片放大预览"
                    className="block h-auto max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] w-auto cursor-zoom-in"
                    onClick={() => setPreviewZoom((current) => current === 1 ? 2 : 1)}
                  />
                )}
              </div>
              <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-slate-950/70 p-1 text-white backdrop-blur">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-white hover:bg-white/10" onClick={() => zoomImageBy(-0.25)} aria-label="缩小图片" disabled={previewZoom <= 1}><Minus className="size-4" /></Button>
                <span className="w-12 text-center text-xs font-semibold tabular-nums text-white">{Math.round(previewZoom * 100)}%</span>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-white hover:bg-white/10" onClick={() => zoomImageBy(0.25)} aria-label="放大图片" disabled={previewZoom >= 4}><Plus className="size-4" /></Button>
                <Button type="button" variant="ghost" className="h-8 px-2 text-xs font-semibold text-white hover:bg-white/10" onClick={() => setPreviewZoom(1)}>适合窗口</Button>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-white hover:bg-white/10" onClick={closeImagePreview} aria-label="关闭预览"><X className="size-4" /></Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <PageErrorDialog open={Boolean(error)} message={error} onClose={() => setError(null)} />
      <PageErrorDialog open={Boolean(success)} message={success} tone="success" onClose={() => setSuccess(null)} />
    </DashboardLayout>
  );
}
