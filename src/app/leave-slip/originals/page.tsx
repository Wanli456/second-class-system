'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, FileCheck2, Plus, Search, Trash2, Upload } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { FilePreviewLink } from '@/components/FilePreviewDialog';
import { ImageUploadPreviews } from '@/components/ImageUploadPreviews';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ActivityOption { id: string; full_name: string; }

interface OriginalSlip {
  id: string;
  activity_id: string | null;
  activity_name: string | null;
  class_names: string | null;
  student_names: string | null;
  start_time: string | null;
  end_time: string | null;
  image_url: string | null;
  image_name: string | null;
  image_list: string | null;
  notes: string | null;
  created_at: string;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [value];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function parseImageList(value: string | null): Array<{ url: string; name?: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === 'object' && item.url).map((item) => ({ url: String(item.url), name: item.name ? String(item.name) : undefined }));
  } catch {
    return [];
  }
  return [];
}

type StudentEntry = { studentId: string; studentName: string; className: string };

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

function normalizeStudentEntry(entry: string): StudentEntry | null {
  const fields = entry.split(/[｜|，,\t]+/).flatMap((item) => item.trim().split(/\s+/))
    .map((item) => item.replace(/^(?:学号|姓名|班级)\s*[:：]?\s*/u, '').trim()).filter(Boolean);
  const studentId = fields.find(isStudentId) || '';
  const className = fields.find(isClassName) || '';
  const studentName = fields.find((item) => item !== studentId && item !== className
    && !/^(?:辅导员|导员|班主任|指导老师|老师|签字|联系电话|电话)/u.test(item)
    && /^[\u4e00-\u9fff]{2,8}$/u.test(item)) || '';
  return studentId && studentName && className ? { studentId, studentName, className } : null;
}

function parseStudentEntries(value: string): string[] {
  return value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).map((entry, index) => {
    const student = normalizeStudentEntry(entry);
    if (!student) throw new Error('第 ' + (index + 1) + ' 名学生信息无法确定学号、姓名、班级；三项可任意排序，但必须完整填写');
    return formatStudentEntry(student.studentId, student.studentName, student.className);
  });
}

function formatStudentEntry(studentId: string, name: string, className: string): string {
  return [studentId.trim(), name.trim(), className.trim()].join('｜');
}

function getClassNamesFromStudents(entries: string[]): string[] {
  return [...new Set(entries.map((entry) => entry.split('｜')[2]).filter(Boolean))];
}

export default function LeaveSlipOriginalsPage({ mode = 'maintain' }: { mode?: 'submit' | 'maintain' }) {
  const { user, initialized } = useUser();
  const isSubmitMode = mode === 'submit';
  const [originals, setOriginals] = useState<OriginalSlip[]>([]);
  const [keyword, setKeyword] = useState('');
  const [activityName, setActivityName] = useState('');
  const [activityId, setActivityId] = useState('');
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [studentNamesText, setStudentNamesText] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<OriginalSlip | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrLines, setOcrLines] = useState<Array<{ text: string; score?: number }>>([]);

  const clearAutomaticRecognition = () => {
    // 已选原图、活动和时间保持不变，只清除自动写入的名单、文字和提示。
    setStudentNamesText('');
    setOcrLines([]);
    setOcrError('');
  };
  const [submitSuccess, setSubmitSuccess] = useState('');

  const canAccess = isSubmitMode
    ? hasPermission(user, 'canSubmitOriginalLeave')
    : hasPermission(user, 'canManageOriginalLeave');

  useEffect(() => {
    const urls = imageFiles.map((file) => URL.createObjectURL(file));
    setImagePreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [imageFiles]);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return originals;
    const query = keyword.trim().toLowerCase();
    return originals.filter((item) => `${item.activity_name || ''} ${item.activity_id || ''} ${item.class_names || ''} ${item.student_names || ''}`.toLowerCase().includes(query));
  }, [originals, keyword]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/leave-slips/originals');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '查询失败');
      setOriginals(data.data || []);
    } catch (error) {
      alert(error instanceof Error ? error.message : '查询失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (initialized && user && canAccess && !isSubmitMode) void load(); }, [initialized, user, canAccess, isSubmitMode]);

  useEffect(() => {
    if (!initialized || !user || !canAccess || !isSubmitMode) return;
    apiFetch('/api/activities?purpose=leave').then((res) => res.json()).then((data) => {
      if (data.success) setActivityOptions(data.data || []);
    }).catch(() => {});
  }, [initialized, user, canAccess, isSubmitMode]);

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
    setOcrLoading(true);
    setOcrError('');
    setOcrLines([]);
    try {
      // 所有假条图片均交给服务端统一做 OpenCV 矫正、表头分列和花名册校验。
      // 前端预裁切会截掉倾斜拍摄时的学号列，且无法可靠排除右侧辅导员列。
      const uploaded = await uploadFilesToUrls(files);

      const res = await apiFetch('/api/ocr/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: uploaded.map((item) => item.url) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '自动识别失败');

      const fields = data.data.fields || {};
      const classStudents = Array.isArray(fields.class_students)
        ? fields.class_students as Array<{ class_name?: unknown; students?: unknown; student_ids?: unknown }>
        : [];
      const rawStudents: string[] = Array.isArray(fields.students) ? fields.students.map((item: unknown) => String(item)).filter(Boolean) : [];
      const rawIds: string[] = Array.isArray(fields.student_ids) ? fields.student_ids.map((item: unknown) => String(item)).filter(Boolean) : [];

      let studentText = '';
      if (classStudents.length) {
        const entries: string[] = [];
        for (const item of classStudents) {
          const className = String(item.class_name || '');
          const classStudentNames = Array.isArray(item.students) ? item.students.map(String).filter(Boolean) : [];
          const classStudentIds = Array.isArray(item.student_ids) ? item.student_ids.map(String) : [];
          classStudentNames.forEach((name, index) => entries.push(formatStudentEntry(classStudentIds[index] || '', name, className)));
        }
        studentText = entries.join('\n');
      } else if (rawStudents.length) {
        studentText = rawStudents.map((name, index) => formatStudentEntry(rawIds[index] || '', name, '')).join('\n');
      }

      if (fields.activity_name) {
        const recognizedActivity = String(fields.activity_name);
        setActivityName(recognizedActivity);
        const match = activityOptions.find((item) => item.full_name === recognizedActivity || item.id === recognizedActivity);
        if (match?.id) setActivityId(match.id);
      }
      if (studentText) setStudentNamesText(studentText);
      if (fields.start_time && String(fields.start_time).length >= 16) setStartTime(String(fields.start_time).slice(0, 16));
      if (fields.end_time && String(fields.end_time).length >= 16) setEndTime(String(fields.end_time).slice(0, 16));
      if (fields.suggested_notes) setNotes((previous) => previous || String(fields.suggested_notes));
      setOcrLines(Array.isArray(data.data.lines) ? data.data.lines : []);
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : '自动识别失败');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setImageFiles(files);
    void runOcrForFiles(files);
  };

  const handleSubmit = async () => {
    if (!activityId || !activityName.trim()) { alert('原假条一次只能绑定一个活动，请先选择系统活动'); return; }
    if (!studentNamesText.trim()) { alert('请至少填写一名学生的学号、姓名和班级'); return; }
    let studentEntries: string[] = [];
    try {
      studentEntries = studentNamesText.trim() ? parseStudentEntries(studentNamesText) : [];
    } catch (error) {
      alert(error instanceof Error ? error.message : '学生信息格式不正确');
      return;
    }
    setSaving(true);
    setSubmitSuccess('');
    try {
      const uploaded = imageFiles.length ? await uploadFilesToUrls(imageFiles) : [];
      const classNames = getClassNamesFromStudents(studentEntries);
      const res = await apiFetch('/api/leave-slips/originals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_id: activityId.trim() || null,
          activity_name: activityName.trim() || null,
          class_names: classNames,
          student_names: studentEntries,
          start_time: startTime ? new Date(startTime).toISOString() : null,
          end_time: endTime ? new Date(endTime).toISOString() : null,
          images: uploaded,
          image_url: uploaded[0]?.url || null,
          image_name: uploaded[0]?.name || null,
          ocr_names: studentEntries,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '保存失败');
      setActivityId('');
      setActivityName('');
      setStudentNamesText('');
      setStartTime('');
      setEndTime('');
      setNotes('');
      setImageFiles([]);
      setOcrLines([]);
      if (isSubmitMode) setSubmitSuccess('提交成功，原假条已归档，可在“维护原假条”中查看。');
      else await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/api/leave-slips/originals?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '删除失败');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '删除失败');
    }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><div className="rounded-xl border bg-white p-6 text-center"><h2 className="font-semibold">请先登录</h2><p className="mt-2 text-sm text-slate-500">登录后才能维护原假条。</p><Link href="/login?redirect=/leave-slip/originals" className="mt-4 inline-block rounded-md bg-slate-950 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;
  if (!canAccess) {
    return <DashboardLayout user={user} title="假条查看与对比" activeNavHref="/leave-slip/records"><div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><AlertCircle className="mx-auto size-6 text-amber-600" /><h2 className="mt-3 font-semibold text-amber-900">当前账号没有原假条维护权限</h2><p className="mt-2 text-sm text-amber-800">请联系系统管理员授予 `canManageOriginalLeave` 权限。</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout user={user} title={isSubmitMode ? '提交原假条' : '假条查看与对比'} activeNavHref={isSubmitMode ? '/leave-slip/originals/submit' : '/leave-slip/records'}>
      <div className={isSubmitMode ? 'mx-auto w-full max-w-2xl' : 'mx-auto w-full max-w-6xl'}>
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7">
          <div className={isSubmitMode ? 'flex items-start gap-4' : ''}>
            {isSubmitMode && <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><FileCheck2 className="size-5" /></span>}
            <div><p className="text-sm font-medium text-teal-700">假条管理</p><h2 className="mt-1 text-2xl font-bold text-balance text-slate-950">{isSubmitMode ? '提交原假条' : '维护原假条'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-pretty text-slate-600">{isSubmitMode ? '上传活动方提供的原始假条。系统会自动识别图片内容，请在提交前人工核对。' : '集中查询、核对和维护已归档的活动方原假条。此处不新增、不提交原假条。'}</p>{!isSubmitMode && <div className="mt-4"><Link href="/leave-slip/records/compare"><Button type="button" variant="outline">返回假条对比</Button></Link></div>}</div>
          </div>
        </header>

        <div>
          {isSubmitMode && <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4 sm:px-7"><h3 className="text-base font-semibold text-slate-950">原假条信息</h3><p className="mt-1 text-sm text-pretty text-slate-500">一张原假条只能关联一个系统活动。</p></div><div className="space-y-4 px-5 py-6 sm:px-7">
              <label className="block space-y-2"><span className="text-sm font-medium text-slate-800">关联活动</span>
              <input aria-label="活动名称" list="original-activity-options" placeholder="输入活动名称或活动 ID" value={activityName} onChange={(event) => { setActivityName(event.target.value); const match = activityOptions.find((item) => item.full_name === event.target.value || item.id === event.target.value); setActivityId(match?.id || ''); }} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
              </label>
              <datalist id="original-activity-options">{activityOptions.map((activity) => <option key={activity.id} value={activity.full_name}>{activity.id}</option>)}</datalist>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs tabular-nums text-slate-600">已绑定活动 ID：<span className="font-medium text-slate-800">{activityId || '未选择'}</span></div>
              <label className="block space-y-2"><span className="text-sm font-medium text-slate-800">涉及学生（学号｜姓名｜班级）</span><textarea aria-label="涉及学生的学号、姓名和班级" placeholder={'每行一名学生，例如：\n20250001｜刘玉｜应化2532\n20250002｜宣锐｜应急2531'} value={studentNamesText} onChange={(event) => setStudentNamesText(event.target.value)} className="min-h-32 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label>
              <p className="-mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">每行只填写一名学生，学号、姓名、班级三项可任意排序并用竖线分隔；系统会统一保存为 <span className="font-medium text-slate-800">学号｜姓名｜班级</span>。上传后自动识别原图：班级、姓名会先带入；只有花名册唯一匹配时才带入学号，否则学号留空，请人工补全并核对后提交。辅导员姓名不会写入学生名单。</p>
              <div className="grid grid-cols-2 gap-2">
                <input aria-label="开始时间" type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-teal-600" />
                <input aria-label="结束时间" type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-teal-600" />
              </div>
              <label className="block space-y-2"><span className="text-sm font-medium text-slate-800">备注 <span className="font-normal text-slate-400">（可选）</span></span><textarea aria-label="备注" placeholder="补充说明" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label>
              <label className="relative block cursor-pointer rounded-xl border border-dashed border-teal-200 bg-teal-50/40 px-4 py-5 transition-colors hover:bg-teal-50">
                <span className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm"><Upload className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-800">选择原假条图片</span><span className="mt-1 block truncate text-xs text-slate-500">{imageFiles.length ? `已选择 ${imageFiles.length} 张图片` : '支持一次选择多张截图'}</span></span></span>
                <input type="file" accept="image/*" multiple className="sr-only" onChange={handleImageChange} />
              </label>
              <ImageUploadPreviews imageUrls={imagePreviews} altPrefix="原假条图片" onRemove={(index) => setImageFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="button" variant="outline" onClick={() => void runOcrForFiles(imageFiles)} disabled={ocrLoading || !imageFiles.length} className="h-11 bg-white">自动识别</Button>
                <Button type="button" variant="outline" onClick={clearAutomaticRecognition} disabled={ocrLoading} className="h-11 bg-white">清除自动识别数据</Button>
                <Button type="button" onClick={handleSubmit} disabled={saving || ocrLoading} className="h-11 bg-teal-700 hover:bg-teal-800"><Plus className="size-4" />{ocrLoading ? '自动识别中...' : saving ? '提交中...' : '提交原假条'}</Button>
              </div>
              {ocrError && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{ocrError}</p>}
              {submitSuccess && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><p className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0" />{submitSuccess}</p><Button type="button" variant="outline" size="sm" className="border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100" onClick={() => setSubmitSuccess('')}>重新提交</Button></div>}
              {ocrLines.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">自动识别结果（初稿，请人工核对后保存）</p>
                  <div className="max-h-40 space-y-1 overflow-auto">
                    {ocrLines.map((line, index) => <p key={`${line.text}-${index}`} className="text-xs leading-5 text-slate-700">{line.text}</p>)}
                  </div>
                </div>
              )}
            </div>
          </aside>}

          {!isSubmitMode && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-600" placeholder="本地筛选原假条" />
              </label>
              <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} className="h-10 bg-white">刷新</Button>
            </div>

            <div className="space-y-4">
              {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center"><FileCheck2 className="mx-auto size-7 text-slate-400" /><h3 className="mt-3 text-base font-semibold text-slate-800">没有匹配的归档原假条</h3><p className="mt-1 text-sm text-pretty text-slate-500">请调整查询关键词，或点击“刷新”重新获取归档记录。</p></div> : null}
              {filtered.map((original) => {
                const classNames = parseJsonArray(original.class_names);
                const studentNames = parseJsonArray(original.student_names);
                return (
                  <article key={original.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        {original.activity_name && <h3 className="font-semibold text-slate-950">{original.activity_name}</h3>}
                        {original.activity_id && <p className="mt-1 text-xs tabular-nums text-slate-500">ID：{original.activity_id}</p>}
                        {classNames.length > 0 && <p className="mt-2 text-sm text-slate-700">涉及班级：{classNames.join('、')}</p>}
                        {studentNames.length > 0 && <p className="mt-1 text-sm text-slate-700">涉及学生：{studentNames.join('、')}</p>}
                        {original.notes && <p className="mt-1 text-sm text-slate-500">{original.notes}</p>}
                        {parseImageList(original.image_list).length > 0 || original.image_url ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(() => {
                              const images = parseImageList(original.image_list);
                              if (images.length > 0) return images.map((image, index) => <FilePreviewLink key={`${image.url}-${index}`} url={image.url} fileName={image.name} label={`打开原件核对 ${index + 1}`} className="text-sm font-medium text-teal-700 hover:text-teal-800" />);
                              return original.image_url ? [<FilePreviewLink key="legacy" url={original.image_url} fileName={original.image_name || undefined} label="打开原件核对" className="text-sm font-medium text-teal-700 hover:text-teal-800" />] : null;
                            })()}
                          </div>
                        ) : <p className="mt-3 text-sm text-amber-700">此归档记录未附原假条图片，暂时无法核对原件。</p>}
                      </div>
                      <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteTarget(original)} aria-label="删除原假条"><Trash2 className="size-3.5" />删除</Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除原假条？</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复，将影响该原假条的关联记录。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
