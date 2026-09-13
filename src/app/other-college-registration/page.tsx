'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, CheckCircle2, FileText, LogIn, Upload } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { ImageUploadPreviews } from '@/components/ImageUploadPreviews';
import { hasPermission } from '@/lib/department-permissions';
import { CATEGORIES } from '@/lib/types';
import { OTHER_COLLEGES } from '@/lib/other-college-registration';
import { useUser } from '@/contexts/UserContext';
import { formatBusinessDateTime } from '@/lib/datetime';
import { Button } from '@/components/ui/button';

type UploadedFile = { url: string; fileName: string };
type RegistrationRecord = { id: string; full_name: string; start_time: string; end_time: string; category: string; scope_name?: string | null; leader_name: string; leader_phone: string; scoring_status: string; scoring_table_url: string | null; scoring_table_file_name: string | null; record_photo_url: string | null; record_photo_file_name: string | null; submission_count?: number; created_at: string };

async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucket', 'app-files');
  formData.append('purpose', 'other-college');
  const response = await apiFetch('/api/upload', { method: 'POST', body: formData });
  const data = await response.json() as { success?: boolean; url?: string; file_name?: string; error?: string };
  if (!data.success || !data.url) throw new Error(data.error || '文件上传失败');
  return { url: data.url, fileName: data.file_name || file.name };
}

export default function OtherCollegeRegistrationPage() {
  const { user, initialized } = useUser();
  const [fullName, setFullName] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [category, setCategory] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [scoringTable, setScoringTable] = useState<File | null>(null);
  const [recordPhoto, setRecordPhoto] = useState<File | null>(null);
  const [recordPhotoPreview, setRecordPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const canRegister = hasPermission(user, 'canRegisterOtherCollege');
  const [records, setRecords] = useState<RegistrationRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingScoring, setExistingScoring] = useState<UploadedFile | null>(null);
  const [existingRecordPhoto, setExistingRecordPhoto] = useState<UploadedFile | null>(null);

  const handleFile = (setter: (file: File | null) => void) => (event: ChangeEvent<HTMLInputElement>) => setter(event.target.files?.[0] || null);
  useEffect(() => {
    if (!recordPhoto) { setRecordPhotoPreview(null); return; }
    const url = URL.createObjectURL(recordPhoto);
    setRecordPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [recordPhoto]);
  const loadRecords = async () => {
    try {
      const response = await apiFetch('/api/other-college-registrations');
      const data = await response.json();
      if (data.success) setRecords(data.data || []);
    } catch { setRecords([]); }
  };
  useEffect(() => { if (initialized && user && canRegister) void loadRecords(); }, [canRegister, initialized, user]);

  const startEdit = (record: RegistrationRecord) => {
    setEditingId(record.id); setFullName(record.full_name); setOrganizer(record.scope_name || ''); setCategory(record.category); setStartTime(record.start_time.slice(0, 16)); setEndTime(record.end_time.slice(0, 16)); setLeaderName(record.leader_name); setContactPhone(record.leader_phone); setExistingScoring(record.scoring_table_url ? { url: record.scoring_table_url, fileName: record.scoring_table_file_name || '赋分表' } : null); setExistingRecordPhoto(record.record_photo_url ? { url: record.record_photo_url, fileName: record.record_photo_file_name || '备案表照片' } : null); setScoringTable(null); setRecordPhoto(null); setError(''); setSuccess(null); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSuccess(null);
    if ((!scoringTable && !existingScoring) || (!recordPhoto && !existingRecordPhoto)) { setError('请同时上传赋分表和备案表照片。'); return; }
    setSubmitting(true);
    try {
      let scoringUpload: UploadedFile;
      let recordUpload: UploadedFile;
      try {
        scoringUpload = scoringTable ? await uploadFile(scoringTable) : existingScoring!;
      } catch (reason) {
        throw new Error('赋分表上传失败：' + (reason instanceof Error ? reason.message : '请稍后重试'));
      }
      try {
        recordUpload = recordPhoto ? await uploadFile(recordPhoto) : existingRecordPhoto!;
      } catch (reason) {
        throw new Error('备案表照片上传失败：' + (reason instanceof Error ? reason.message : '请稍后重试'));
      }
      const response = await apiFetch('/api/other-college-registrations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ id: editingId, fullName, organizer, category, startTime, endTime, leaderName, contactPhone, scoringTableUrl: scoringUpload.url, scoringTableFileName: scoringUpload.fileName, recordPhotoUrl: recordUpload.url, recordPhotoFileName: recordUpload.fileName }) });
      const data = await response.json() as { success?: boolean; error?: string; data?: { submission_count?: number } };
      if (!data.success) throw new Error(data.error || '登记失败');
      const attempt = Number(data.data?.submission_count || 1); setSuccess(attempt > 1 ? `登记成功，第 ${attempt} 次提交` : '登记成功，已进入“活动赋分”的待赋分列表。'); setEditingId(null); setExistingScoring(null); setExistingRecordPhoto(null); setFullName(''); setOrganizer(''); setCategory(''); setStartTime(''); setEndTime(''); setLeaderName(''); setContactPhone(''); setScoringTable(null); setRecordPhoto(null); await loadRecords();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '网络异常，登记失败，请稍后重试。'); } finally { setSubmitting(false); }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><Link href="/login?redirect=/other-college-registration" className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"><LogIn className="size-4" />登录后登记</Link></main>;
  if (!canRegister) return <DashboardLayout user={user} title="其他学院登记"><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">当前账号没有提交赋分材料权限，不能使用其他学院登记。</div></DashboardLayout>;
  return <DashboardLayout user={user} title="其他学院登记"><div className="mx-auto max-w-3xl space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Building2 className="size-5" /></span><div><h1 className="text-balance text-xl font-semibold text-slate-950">其他学院登记</h1><p className="mt-1 text-pretty text-sm leading-6 text-slate-600">登记其他学院主办的校级活动。提交后直接进入“活动赋分”待赋分列表，不会生成活动提交记录。</p></div></div></section><form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">登记及材料提交人：<span className="font-medium text-slate-950">{user.name}（{user.studentId}）</span><span className="ml-2 text-xs text-slate-500">由当前登录账号自动记录，不可代填。</span></div>{editingId && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">正在覆盖原登记记录，提交次数会递增；已赋分记录不能覆盖。</p>}<div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 sm:col-span-2">活动名称<input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="请输入校级活动名称" /></label><label className="text-sm font-medium text-slate-700">主办学院<select required value={organizer} onChange={(event) => setOrganizer(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择主办学院</option>{OTHER_COLLEGES.map((college) => <option key={college} value={college}>{college}</option>)}</select></label><label className="text-sm font-medium text-slate-700">活动类别<select required value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择类别</option>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-sm font-medium text-slate-700">开始时间<input required type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-slate-700">结束时间<input required type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-slate-700">活动负责人姓名<input required value={leaderName} onChange={(event) => setLeaderName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="填写外院活动负责人姓名" /></label><label className="text-sm font-medium text-slate-700">活动负责人联系电话<input required value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="填写外院活动负责人电话" /></label></div><div className="grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2"><label className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700"><span className="flex items-center gap-2 font-medium"><FileText className="size-4 text-teal-700" />赋分表（必传）</span><input required={!editingId && !existingScoring} type="file" onChange={handleFile(setScoringTable)} className="mt-3 block w-full text-xs" />{scoringTable ? <span className="mt-2 block truncate text-xs text-teal-700">{scoringTable.name}</span> : existingScoring && <span className="mt-2 block truncate text-xs text-emerald-700">沿用：{existingScoring.fileName}</span>}</label><label className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700"><span className="flex items-center gap-2 font-medium"><Upload className="size-4 text-teal-700" />备案表照片（必传）</span><input required={!editingId && !existingRecordPhoto} type="file" accept="image/*" onChange={handleFile(setRecordPhoto)} className="mt-3 block w-full text-xs" />{recordPhoto ? <span className="mt-2 block truncate text-xs text-teal-700">{recordPhoto.name}</span> : existingRecordPhoto && <span className="mt-2 block truncate text-xs text-emerald-700">沿用：{existingRecordPhoto.fileName}</span>}{recordPhotoPreview && <ImageUploadPreviews imageUrls={[recordPhotoPreview]} altPrefix="备案表照片" onRemove={() => setRecordPhoto(null)} />}</label></div>{error && <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="size-4 shrink-0" />{error}</p>}{success && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="size-4 shrink-0" />{success}</p>}<button disabled={submitting} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"><Upload className="size-4" />{submitting ? '正在提交…' : editingId ? '重新提交并进入待赋分' : '提交并进入待赋分'}</button></form>{records.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">我的登记记录</h2><div className="mt-3 space-y-2">{records.map((record) => <div key={record.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5"><span className="text-sm font-medium text-slate-800">{record.full_name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{record.scoring_status}</span>{Number(record.submission_count || 1) > 1 && <span className="text-xs text-amber-700">第 {record.submission_count} 次提交</span>}<span className="ml-auto text-xs text-slate-400">{formatBusinessDateTime(record.created_at, '-')}</span>{record.scoring_status !== '已赋分' && <Button type="button" variant="outline" size="sm" onClick={() => startEdit(record)} className="border-teal-200 text-teal-700 hover:bg-teal-50">重新提交</Button>}</div>)}</div></section>}</div></DashboardLayout>;
}
