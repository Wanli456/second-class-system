'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, FileCheck2, Plus, ScanText, Search, Trash2, Upload } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { FilePreviewLink } from '@/components/FilePreviewDialog';
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

export default function LeaveSlipOriginalsPage() {
  const { user, initialized } = useUser();
  const [originals, setOriginals] = useState<OriginalSlip[]>([]);
  const [keyword, setKeyword] = useState('');
  const [activityName, setActivityName] = useState('');
  const [activityId, setActivityId] = useState('');
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [classNamesText, setClassNamesText] = useState('');
  const [studentNamesText, setStudentNamesText] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<OriginalSlip | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrLines, setOcrLines] = useState<Array<{ text: string; score?: number }>>([]);

  const canAccess = user?.role === 'admin' || user?.canManageOriginalLeave === true;

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

  useEffect(() => { if (initialized && user && canAccess) void load(); }, [initialized, user, canAccess]);

  useEffect(() => {
    if (!initialized || !user || !canAccess) return;
    apiFetch('/api/activities?purpose=leave').then((res) => res.json()).then((data) => {
      if (data.success) setActivityOptions(data.data || []);
    }).catch(() => {});
  }, [initialized, user, canAccess]);

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

  const handleOcr = async () => {
    if (!imageFiles.length) { alert('请先选择原假条图片'); return; }
    setOcrLoading(true);
    setOcrError('');
    setOcrLines([]);
    try {
      const uploaded = await uploadFilesToUrls(imageFiles);

      const res = await apiFetch('/api/ocr/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: uploaded.map((item) => item.url) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'OCR 识别失败');

      const fields = data.data.fields || {};
      if (fields.activity_name) setActivityName(String(fields.activity_name));
      if (Array.isArray(fields.classes) && fields.classes.length) setClassNamesText(fields.classes.join('、'));
      if (Array.isArray(fields.students) && fields.students.length) setStudentNamesText(fields.students.join('、'));
      if (fields.start_time && String(fields.start_time).length >= 16) setStartTime(String(fields.start_time).slice(0, 16));
      if (fields.end_time && String(fields.end_time).length >= 16) setEndTime(String(fields.end_time).slice(0, 16));
      if (fields.suggested_notes) setNotes((previous) => previous || String(fields.suggested_notes));
      setOcrLines(Array.isArray(data.data.lines) ? data.data.lines : []);
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'OCR 识别失败');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!activityId || !activityName.trim()) { alert('原假条一次只能绑定一个活动，请先选择系统活动'); return; }
    if (!studentNamesText.trim() && !classNamesText.trim()) { alert('请至少填写班级或学生'); return; }
    setSaving(true);
    try {
      const uploaded = imageFiles.length ? await uploadFilesToUrls(imageFiles) : [];
      const res = await apiFetch('/api/leave-slips/originals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_id: activityId.trim() || null,
          activity_name: activityName.trim() || null,
          class_names: classNamesText.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean),
          student_names: studentNamesText.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean),
          start_time: startTime ? new Date(startTime).toISOString() : null,
          end_time: endTime ? new Date(endTime).toISOString() : null,
          images: uploaded,
          image_url: uploaded[0]?.url || null,
          image_name: uploaded[0]?.name || null,
          ocr_names: studentNamesText.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '保存失败');
      setActivityId('');
      setActivityName('');
      setClassNamesText('');
      setStudentNamesText('');
      setStartTime('');
      setEndTime('');
      setNotes('');
      setImageFiles([]);
      await load();
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
    return <DashboardLayout user={user} title="原假条维护" activeNavHref="/leave-slip/originals"><div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><AlertCircle className="mx-auto size-6 text-amber-600" /><h2 className="mt-3 font-semibold text-amber-900">当前账号没有原假条维护权限</h2><p className="mt-2 text-sm text-amber-800">请联系系统管理员授予 `canManageOriginalLeave` 权限。</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout user={user} title="原假条维护" activeNavHref="/leave-slip/originals">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase text-teal-700">假条管理</p>
          <h2 className="mt-2 text-2xl font-bold text-balance text-slate-950">维护活动方原假条</h2>
          <p className="mt-2 text-sm text-pretty text-slate-600">录入活动方提供的原始假条，供查询和人工匹配班级负责人上传的假条。</p>
        </header>

        <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950"><FileCheck2 className="size-4 text-teal-700" />新增原假条</h3>
            <div className="mt-4 space-y-3">
              <input aria-label="活动名称" list="original-activity-options" placeholder="输入活动名称或ID，一次一种活动" value={activityName} onChange={(event) => { setActivityName(event.target.value); const match = activityOptions.find((item) => item.full_name === event.target.value || item.id === event.target.value); setActivityId(match?.id || ''); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600" />
              <datalist id="original-activity-options">{activityOptions.map((activity) => <option key={activity.id} value={activity.full_name}>{activity.id}</option>)}</datalist>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs tabular-nums text-slate-600">已绑定活动ID：{activityId || '未选择'}（一次只能绑一个活动）</div>
              <textarea aria-label="涉及班级" placeholder="涉及班级，逗号分隔" value={classNamesText} onChange={(event) => setClassNamesText(event.target.value)} className="min-h-16 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600" />
              <textarea aria-label="涉及学生" placeholder="涉及学生姓名/学号，逗号分隔" value={studentNamesText} onChange={(event) => setStudentNamesText(event.target.value)} className="min-h-16 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600" />
              <div className="grid grid-cols-2 gap-2">
                <input aria-label="开始时间" type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-teal-600" />
                <input aria-label="结束时间" type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-teal-600" />
              </div>
              <textarea aria-label="备注" placeholder="备注（可选）" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-16 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600" />
              <label className="block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 transition-colors hover:border-teal-400">
                <span className="flex items-center gap-2"><Upload className="size-4 text-teal-700" /><span className="min-w-0 flex-1 truncate text-xs text-slate-600">{imageFiles.length ? `已选 ${imageFiles.length} 张截图` : '上传原假条图片（多张截图可一次全选）'}</span></span>
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => setImageFiles(Array.from(event.target.files || []))} />
              </label>
              <Button type="button" variant="outline" onClick={handleOcr} disabled={ocrLoading || !imageFiles.length} className="w-full bg-white disabled:opacity-50"><ScanText className="size-4" />{ocrLoading ? 'OCR 识别中...' : 'OCR 自动识别'}</Button>
              {ocrError && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{ocrError}</p>}
              {ocrLines.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">识别结果（初稿，请人工核对后保存）</p>
                  <div className="max-h-40 space-y-1 overflow-auto">
                    {ocrLines.map((line, index) => <p key={`${line.text}-${index}`} className="text-xs leading-5 text-slate-700">{line.text}</p>)}
                  </div>
                </div>
              )}
              <Button type="button" onClick={handleSubmit} disabled={saving} className="w-full bg-slate-950 hover:bg-slate-800"><Plus className="size-4" />{saving ? '保存中...' : '保存原假条'}</Button>
            </div>
          </aside>

          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-600" placeholder="本地筛选原假条" />
              </label>
              <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} className="h-10 bg-white">刷新</Button>
            </div>

            <div className="space-y-4">
              {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-400">暂无原假条</div> : null}
              {filtered.map((original) => {
                const classNames = parseJsonArray(original.class_names);
                const studentNames = parseJsonArray(original.student_names);
                return (
                  <article key={original.id} className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 shadow-sm">
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
                              if (images.length > 0) return images.map((image, index) => <FilePreviewLink key={`${image.url}-${index}`} url={image.url} fileName={image.name} label={`查看原假条图片 ${index + 1}`} className="text-xs text-sky-700" />);
                              return original.image_url ? [<FilePreviewLink key="legacy" url={original.image_url} fileName={original.image_name || undefined} label="查看原假条图片" className="text-xs text-sky-700" />] : null;
                            })()}
                          </div>
                        ) : null}
                      </div>
                      <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteTarget(original)} aria-label="删除原假条"><Trash2 className="size-3.5" />删除</Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
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