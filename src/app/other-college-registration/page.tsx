'use client';

import { ChangeEvent, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, CheckCircle2, FileText, LogIn, Upload } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { hasPermission } from '@/lib/department-permissions';
import { CATEGORIES } from '@/lib/types';
import { OTHER_COLLEGES } from '@/lib/other-college-registration';
import { useUser } from '@/contexts/UserContext';

type UploadedFile = { url: string; fileName: string };

async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucket', 'app-files');
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
  const [contactPhone, setContactPhone] = useState('');
  const [scoringTable, setScoringTable] = useState<File | null>(null);
  const [recordPhoto, setRecordPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const canRegister = hasPermission(user, 'canSubmitScoring');

  const handleFile = (setter: (file: File | null) => void) => (event: ChangeEvent<HTMLInputElement>) => setter(event.target.files?.[0] || null);
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSuccess(false);
    if (!scoringTable || !recordPhoto) { setError('请同时上传赋分表和备案表照片。'); return; }
    setSubmitting(true);
    try {
      let scoringUpload: UploadedFile;
      let recordUpload: UploadedFile;
      try {
        scoringUpload = await uploadFile(scoringTable);
      } catch (reason) {
        throw new Error('赋分表上传失败：' + (reason instanceof Error ? reason.message : '请稍后重试'));
      }
      try {
        recordUpload = await uploadFile(recordPhoto);
      } catch (reason) {
        throw new Error('备案表照片上传失败：' + (reason instanceof Error ? reason.message : '请稍后重试'));
      }
      const response = await apiFetch('/api/other-college-registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, organizer, category, startTime, endTime, contactPhone, scoringTableUrl: scoringUpload.url, scoringTableFileName: scoringUpload.fileName, recordPhotoUrl: recordUpload.url, recordPhotoFileName: recordUpload.fileName }) });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!data.success) throw new Error(data.error || '登记失败');
      setSuccess(true); setFullName(''); setOrganizer(''); setCategory(''); setStartTime(''); setEndTime(''); setContactPhone(''); setScoringTable(null); setRecordPhoto(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '网络异常，登记失败，请稍后重试。'); } finally { setSubmitting(false); }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><Link href="/login?redirect=/other-college-registration" className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"><LogIn className="size-4" />登录后登记</Link></main>;
  if (!canRegister) return <DashboardLayout user={user} title="其他学院登记"><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">当前账号没有提交赋分材料权限，不能使用其他学院登记。</div></DashboardLayout>;
  return <DashboardLayout user={user} title="其他学院登记"><div className="mx-auto max-w-3xl space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Building2 className="size-5" /></span><div><h1 className="text-balance text-xl font-semibold text-slate-950">其他学院登记</h1><p className="mt-1 text-pretty text-sm leading-6 text-slate-600">登记其他学院主办的校级活动。提交后直接进入“活动赋分”待赋分列表，不会生成活动提交记录。</p></div></div></section><form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 sm:col-span-2">活动名称<input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="请输入校级活动名称" /></label><label className="text-sm font-medium text-slate-700">主办学院<select required value={organizer} onChange={(event) => setOrganizer(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择主办学院</option>{OTHER_COLLEGES.map((college) => <option key={college} value={college}>{college}</option>)}</select></label><label className="text-sm font-medium text-slate-700">活动类别<select required value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择类别</option>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-sm font-medium text-slate-700">开始时间<input required type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-slate-700">结束时间<input required type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-slate-700 sm:col-span-2">经办人联系电话<input required value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="用于活动赋分核对" /></label></div><div className="grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2"><label className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700"><span className="flex items-center gap-2 font-medium"><FileText className="size-4 text-teal-700" />赋分表（必传）</span><input required type="file" onChange={handleFile(setScoringTable)} className="mt-3 block w-full text-xs" />{scoringTable && <span className="mt-2 block truncate text-xs text-teal-700">{scoringTable.name}</span>}</label><label className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700"><span className="flex items-center gap-2 font-medium"><Upload className="size-4 text-teal-700" />备案表照片（必传）</span><input required type="file" accept="image/*" onChange={handleFile(setRecordPhoto)} className="mt-3 block w-full text-xs" />{recordPhoto && <span className="mt-2 block truncate text-xs text-teal-700">{recordPhoto.name}</span>}</label></div>{error && <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="size-4 shrink-0" />{error}</p>}{success && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="size-4 shrink-0" />登记成功，已进入“活动赋分”的待赋分列表。</p>}<button disabled={submitting} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"><Upload className="size-4" />{submitting ? '正在提交…' : '提交并进入待赋分'}</button></form></div></DashboardLayout>;
}
