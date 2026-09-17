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
import { MAX_OTHER_COLLEGE_RECORD_PHOTOS, parseStoredRecordPhotos, type RecordPhoto } from '@/lib/other-college-record-photos';
import { useUser } from '@/contexts/UserContext';
import { formatBusinessDateTime } from '@/lib/datetime';
import { Button } from '@/components/ui/button';

type UploadedFile = RecordPhoto;
type RegistrationRecord = {
  id: string;
  full_name: string;
  start_time: string;
  end_time: string;
  category: string;
  scope_name?: string | null;
  leader_name: string;
  leader_phone: string;
  scoring_status: string;
  scoring_table_url: string | null;
  scoring_table_file_name: string | null;
  record_photo_url: string | null;
  record_photo_file_name: string | null;
  record_photo_list?: string | null;
  submission_count?: number;
  created_at: string;
};

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
  const [recordPhotoFiles, setRecordPhotoFiles] = useState<File[]>([]);
  const [recordPhotoPreviews, setRecordPhotoPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const canRegister = hasPermission(user, 'canRegisterOtherCollege');
  const [records, setRecords] = useState<RegistrationRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingScoring, setExistingScoring] = useState<UploadedFile | null>(null);
  const [existingRecordPhotos, setExistingRecordPhotos] = useState<RecordPhoto[]>([]);

  useEffect(() => {
    const urls = recordPhotoFiles.map((file) => URL.createObjectURL(file));
    setRecordPhotoPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [recordPhotoFiles]);

  const loadRecords = async () => {
    try {
      const response = await apiFetch('/api/other-college-registrations');
      const data = await response.json() as { success?: boolean; data?: RegistrationRecord[] };
      setRecords(data.success ? data.data || [] : []);
    } catch {
      setRecords([]);
    }
  };

  useEffect(() => {
    if (initialized && user && canRegister) void loadRecords();
  }, [canRegister, initialized, user]);

  const resetForm = () => {
    setEditingId(null);
    setExistingScoring(null);
    setExistingRecordPhotos([]);
    setFullName('');
    setOrganizer('');
    setCategory('');
    setStartTime('');
    setEndTime('');
    setLeaderName('');
    setContactPhone('');
    setScoringTable(null);
    setRecordPhotoFiles([]);
  };

  const startEdit = (record: RegistrationRecord) => {
    setEditingId(record.id);
    setFullName(record.full_name);
    setOrganizer(record.scope_name || '');
    setCategory(record.category);
    setStartTime(record.start_time.slice(0, 16));
    setEndTime(record.end_time.slice(0, 16));
    setLeaderName(record.leader_name);
    setContactPhone(record.leader_phone);
    setExistingScoring(record.scoring_table_url ? { url: record.scoring_table_url, fileName: record.scoring_table_file_name || '赋分表' } : null);
    setExistingRecordPhotos(parseStoredRecordPhotos(record.record_photo_list, record.record_photo_url, record.record_photo_file_name));
    setScoringTable(null);
    setRecordPhotoFiles([]);
    setError('');
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScoringFile = (event: ChangeEvent<HTMLInputElement>) => {
    setScoringTable(event.target.files?.[0] || null);
  };

  const handleRecordPhotoFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.currentTarget.value = '';
    if (!files.length) return;
    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      setError('每张备案表照片不能超过 5MB。');
      return;
    }
    const count = existingRecordPhotos.length + recordPhotoFiles.length + files.length;
    if (count > MAX_OTHER_COLLEGE_RECORD_PHOTOS) {
      setError(`备案表照片最多 ${MAX_OTHER_COLLEGE_RECORD_PHOTOS} 张，当前已选择 ${existingRecordPhotos.length + recordPhotoFiles.length} 张。`);
      return;
    }
    setError('');
    setRecordPhotoFiles((current) => [...current, ...files]);
  };

  const removeRecordPhoto = (index: number) => {
    if (index < existingRecordPhotos.length) {
      setExistingRecordPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    const newIndex = index - existingRecordPhotos.length;
    setRecordPhotoFiles((current) => current.filter((_, itemIndex) => itemIndex !== newIndex));
  };

  const uploadRecordPhotos = async (): Promise<UploadedFile[]> => {
    const uploaded: UploadedFile[] = [];
    for (const file of recordPhotoFiles) {
      try {
        uploaded.push(await uploadFile(file));
      } catch (reason) {
        if (uploaded.length) {
          setExistingRecordPhotos((current) => [...current, ...uploaded]);
          setRecordPhotoFiles((current) => current.slice(uploaded.length));
        }
        throw new Error('备案表照片上传失败：' + (reason instanceof Error ? reason.message : '请稍后重试'));
      }
    }
    return uploaded;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess(null);
    if (!scoringTable && !existingScoring) {
      setError('请上传赋分表。');
      return;
    }
    setSubmitting(true);
    try {
      const scoringUpload = scoringTable ? await uploadFile(scoringTable) : existingScoring!;
      const uploadedRecordPhotos = await uploadRecordPhotos();
      const recordPhotos = [...existingRecordPhotos, ...uploadedRecordPhotos];
      if (uploadedRecordPhotos.length) {
        setExistingRecordPhotos(recordPhotos);
        setRecordPhotoFiles([]);
      }
      const response = await apiFetch('/api/other-college-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          id: editingId,
          fullName,
          organizer,
          category,
          startTime,
          endTime,
          leaderName,
          contactPhone,
          scoringTableUrl: scoringUpload.url,
          scoringTableFileName: scoringUpload.fileName,
          recordPhotos,
        }),
      });
      const data = await response.json() as { success?: boolean; error?: string; data?: { submission_count?: number } };
      if (!data.success) throw new Error(data.error || '登记失败');
      const attempt = Number(data.data?.submission_count || 1);
      setSuccess(attempt > 1 ? `登记成功，第 ${attempt} 次提交` : '登记成功，已进入“活动赋分”的待赋分列表。');
      resetForm();
      await loadRecords();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '网络异常，登记失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) {
    return <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><Link href="/login?redirect=/other-college-registration" className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"><LogIn className="size-4" />登录后登记</Link></main>;
  }
  if (!canRegister) {
    return <DashboardLayout user={user} title="其他学院登记"><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">当前账号没有其他学院登记权限，不能使用此功能。</div></DashboardLayout>;
  }

  const previewUrls = [...existingRecordPhotos.map((photo) => photo.url), ...recordPhotoPreviews];
  const previewNames = [...existingRecordPhotos.map((photo) => photo.fileName), ...recordPhotoFiles.map((file) => file.name)];

  return (
    <DashboardLayout user={user} title="其他学院登记">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <div className="flex items-start gap-3"><Building2 className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">其他学院校级活动登记</p><p className="mt-1 leading-6">选择主办学院，上传赋分表；备案表照片可选，支持最多 {MAX_OTHER_COLLEGE_RECORD_PHOTOS} 张。</p></div></div>
        </section>

        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-lg font-semibold text-slate-950">{editingId ? '重新提交其他学院登记' : '新增其他学院登记'}</h1><p className="mt-1 text-sm text-slate-500">校社团可不填写活动负责人姓名、电话和备案表照片。</p></div>{editingId && <Button type="button" variant="outline" size="sm" onClick={resetForm}>取消重新提交</Button>}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">活动名称<input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="填写活动名称" /></label>
            <label className="text-sm font-medium text-slate-700">主办学院<select required value={organizer} onChange={(event) => setOrganizer(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择主办学院</option>{OTHER_COLLEGES.map((college) => <option key={college} value={college}>{college}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">活动类别<select required value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择类别</option>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">开始时间<input required type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
            <label className="text-sm font-medium text-slate-700">结束时间<input required type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
            <label className="text-sm font-medium text-slate-700">活动负责人姓名（可选）<input value={leaderName} onChange={(event) => setLeaderName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="填写外院活动负责人姓名" /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">活动负责人联系电话（可选）<input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="填写外院活动负责人电话" /></label>
          </div>
          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <label className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700"><span className="flex items-center gap-2 font-medium"><FileText className="size-4 text-teal-700" />赋分表（必传）</span><input required={!editingId && !existingScoring} type="file" onChange={handleScoringFile} className="mt-3 block w-full text-xs" />{scoringTable ? <span className="mt-2 block truncate text-xs text-teal-700">{scoringTable.name}</span> : existingScoring && <span className="mt-2 block truncate text-xs text-emerald-700">沿用：{existingScoring.fileName}</span>}</label>
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700"><span className="flex items-center gap-2 font-medium"><Upload className="size-4 text-teal-700" />备案表照片（可选）</span><p className="mt-1 text-xs text-slate-500">可多选或分次追加，每张最多 5MB；已选 {previewUrls.length}/{MAX_OTHER_COLLEGE_RECORD_PHOTOS} 张。</p><input type="file" accept="image/*" multiple onChange={handleRecordPhotoFiles} className="mt-3 block w-full text-xs" aria-label="选择备案表照片" />{previewUrls.length > 0 && <ImageUploadPreviews imageUrls={previewUrls} fileNames={previewNames} altPrefix="备案表照片" onRemove={removeRecordPhoto} />}</div>
          </div>
          {error && <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="size-4 shrink-0" />{error}</p>}
          {success && <p role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="size-4 shrink-0" />{success}</p>}
          <button disabled={submitting} type="submit" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"><Upload className="size-4" />{submitting ? '正在提交…' : editingId ? '重新提交并进入待赋分' : '提交并进入待赋分'}</button>
        </form>

        {records.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">我的登记记录</h2><div className="mt-3 space-y-2">{records.map((record) => { const photos = parseStoredRecordPhotos(record.record_photo_list, record.record_photo_url, record.record_photo_file_name); return <div key={record.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5"><span className="text-sm font-medium text-slate-800">{record.full_name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{record.scoring_status}</span>{photos.length > 0 && <span className="text-xs text-teal-700">备案表照片 {photos.length} 张</span>}{Number(record.submission_count || 1) > 1 && <span className="text-xs text-amber-700">第 {record.submission_count} 次提交</span>}<span className="ml-auto text-xs text-slate-400">{formatBusinessDateTime(record.created_at, '-')}</span>{record.scoring_status !== '已赋分' && <Button type="button" variant="outline" size="sm" onClick={() => startEdit(record)} className="border-teal-200 text-teal-700 hover:bg-teal-50">重新提交</Button>}</div>; })}</div></section>}
      </div>
    </DashboardLayout>
  );
}
