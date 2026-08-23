'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, Send, Upload, Eye } from 'lucide-react';
import { CATEGORIES, CATEGORY_DETAILS, LEVELS, type Category } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { ImageUploadPreviews } from '@/components/ImageUploadPreviews';
import { hasPermission } from '@/lib/department-permissions';
import { canSelectActivityLeader } from '@/lib/activity-leader-rules';

interface DirectoryUser { id: string; username: string; student_id: string; role?: string | null; can_submit_activity?: boolean | null; can_submit_scoring?: boolean | null; department?: string | null; class_name?: string | null; }
interface ActivityScope { type: 'department' | 'class'; name: string; label: string; }
interface Submission { id: string; full_name: string; start_time: string; end_time: string; registration_start_time?: string | null; registration_end_time?: string | null; category: string; category_primary?: string | null; category_secondary?: string | null; level: string; scope_names?: string | null; scope_type?: 'department' | 'class'; scope_name?: string | null; leader_ids?: string | null; plan_file_url: string | null; plan_file_name?: string | null; record_file_url: string | null; record_file_name?: string | null; review_status: string; }

function localDateTime(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function parseIds(value?: string | null) { if (!value) return []; try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return value.split(',').map((item) => item.trim()).filter(Boolean); } }
type ApiResponse<T> = { success?: boolean; data?: T; error?: string };

async function fetchJson<T>(url: string): Promise<ApiResponse<T>> {
  const response = await apiFetch(url);
  const data = await response.json() as ApiResponse<T>;
  if (!response.ok || data.success === false) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export default function SubmitPage() {
  const router = useRouter();
  const { user, initialized } = useUser();
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [form, setForm] = useState({ full_name: '', registration_start_time: '', registration_end_time: '', start_time: '', end_time: '', category: '', category_primary: '', category_secondary: '', level: '' });
  const [hostScope, setHostScope] = useState<ActivityScope | null>(null);
  const [cohostScopes, setCohostScopes] = useState<ActivityScope[]>([]);
  const [leaderIds, setLeaderIds] = useState<string[]>([]);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [recordFile, setRecordFile] = useState<File | null>(null);
  const [existingPlanUrl, setExistingPlanUrl] = useState<string | null>(null);
  const [existingPlanName, setExistingPlanName] = useState<string | null>(null);
  const [existingRecordUrl, setExistingRecordUrl] = useState<string | null>(null);
  const [existingRecordName, setExistingRecordName] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const scopes = useMemo(() => {
    const values = new Map<string, ActivityScope>();
    directory.forEach((item) => {
      if (item.department) values.set(`department:${item.department}`, { type: 'department', name: item.department, label: `部门：${item.department}` });
      if (item.class_name) values.set(`class:${item.class_name}`, { type: 'class', name: item.class_name, label: `班级：${item.class_name}` });
    });
    departments.forEach((name) => values.set(`department:${name}`, { type: 'department', name, label: `部门：${name}` }));
    classes.forEach((name) => values.set(`class:${name}`, { type: 'class', name, label: `班级：${name}` }));
    if (user?.department) values.set(`department:${user.department}`, { type: 'department', name: user.department, label: `部门：${user.department}` });
    if (user?.className) values.set(`class:${user.className}`, { type: 'class', name: user.className, label: `班级：${user.className}` });
    return [...values.values()];
  }, [classes, departments, directory, user]);
  const hostScopes = useMemo(() => scopes.filter((scope) => (
    (scope.type === 'department' && scope.name === user?.department)
    || (scope.type === 'class' && scope.name === user?.className)
  )), [scopes, user?.className, user?.department]);
  const selectedScopes = useMemo(() => hostScope ? [hostScope, ...cohostScopes] : [], [cohostScopes, hostScope]);
  const cohostCandidates = useMemo(() => hostScope
    ? scopes.filter((scope) => scope.type === hostScope.type && scope.name !== hostScope.name)
    : [], [hostScope, scopes]);
  const leaders = useMemo(() => {
    return directory.filter((item) => canSelectActivityLeader(item, selectedScopes));
  }, [directory, selectedScopes]);

  useEffect(() => {
    if (!user) return;
    setHostScope(user.department
      ? { type: 'department', name: user.department, label: `部门：${user.department}` }
      : user.className ? { type: 'class', name: user.className, label: `班级：${user.className}` } : null);
    setCohostScopes([]);
    setLeaderIds([user.id]);
    Promise.all([
      fetchJson<DirectoryUser[]>('/api/auth?directory=true'),
      fetchJson<string[]>('/api/departments'),
      fetchJson<string[]>('/api/class-roster?classes=true'),
    ]).then(([directoryData, departmentData, classData]) => {
      if (directoryData.success) setDirectory(directoryData.data || []);
      if (departmentData.success) setDepartments(departmentData.data || []);
      if (classData.success) setClasses(classData.data || []);
    }).catch((error: unknown) => alert(error instanceof Error ? error.message : '读取部门、班级或人员目录失败，请稍后重试'));
  }, [user]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('submissionId');
    setSubmissionId(id);
    if (!id) return;
    apiFetch(`/api/activities/submit?submission_id=${encodeURIComponent(id)}`).then((res) => res.json()).then((data: { success?: boolean; data?: Submission[]; error?: string }) => {
      const submission = data.success ? data.data?.[0] : null;
      if (!submission) { alert(data.error || '未找到原活动提交记录'); router.replace('/submit'); return; }
      if (submission.review_status === '已通过') { alert('该活动已审核通过，不能重新提交'); router.replace('/submit'); return; }
      setForm({ full_name: submission.full_name, registration_start_time: submission.registration_start_time ? localDateTime(submission.registration_start_time) : '', registration_end_time: submission.registration_end_time ? localDateTime(submission.registration_end_time) : '', start_time: localDateTime(submission.start_time), end_time: localDateTime(submission.end_time), category: submission.category, category_primary: submission.category_primary || '', category_secondary: submission.category_secondary || '', level: submission.level });
      let restoredScopes: ActivityScope[] = [];
      try {
        const parsed: unknown = submission.scope_names ? JSON.parse(submission.scope_names) : null;
        if (Array.isArray(parsed)) restoredScopes = parsed.flatMap((item) => item && typeof item === 'object' && ((item as { type?: unknown }).type === 'department' || (item as { type?: unknown }).type === 'class') && typeof (item as { name?: unknown }).name === 'string' ? [{ type: (item as { type: 'department' | 'class' }).type, name: (item as { name: string }).name, label: `${(item as { type: string }).type === 'department' ? '部门' : '班级'}：${(item as { name: string }).name}` }] : []);
      } catch { restoredScopes = []; }
      if (!restoredScopes.length && submission.scope_name) restoredScopes = [{ type: submission.scope_type || 'department', name: submission.scope_name, label: `${submission.scope_type === 'class' ? '班级' : '部门'}：${submission.scope_name}` }];
      setHostScope(restoredScopes[0] || null); setCohostScopes(restoredScopes.slice(1)); setLeaderIds(parseIds(submission.leader_ids));
      setExistingPlanUrl(submission.plan_file_url); setExistingPlanName(submission.plan_file_name || null); setExistingRecordUrl(submission.record_file_url); setExistingRecordName(submission.record_file_name || null);
    }).catch(() => alert('读取原活动提交记录失败'));
  }, [router]);

  useEffect(() => {
    if (leaders.length && !leaderIds.some((id) => leaders.some((leader) => leader.id === id))) setLeaderIds([leaders[0].id]);
  }, [leaderIds, leaders]);

  const handleHostScopeChange = (value: string) => {
    const nextHost = hostScopes.find((scope) => `${scope.type}:${scope.name}` === value) || null;
    setHostScope(nextHost);
    setCohostScopes([]);
    setLeaderIds(user ? [user.id] : []);
  };

  const uploadFile = async (file: File): Promise<{ url: string; fileName: string }> => {
    const body = new FormData(); body.append('file', file); body.append('bucket', 'app-files');
    const response = await apiFetch('/api/upload', { method: 'POST', body }); const data = await response.json();
    if (!data.success) throw new Error(data.error || '文件上传失败'); return { url: String(data.url), fileName: String(data.file_name || file.name) };
  };

  const handleSubmit = async () => {
    if (!form.full_name || !form.registration_start_time || !form.registration_end_time || !form.start_time || !form.end_time || !form.category || !form.category_primary || !form.category_secondary || !form.level || !hostScope || !leaderIds.length) { alert('请填写活动名称、活动报名时间、活动举办时间、完整二课分类、主办单位并选择负责人'); return; }
    if (!planFile && !existingPlanUrl) { alert('请上传活动策划书'); return; }
    if (!recordFile && !existingRecordUrl) { alert('请上传活动备案表'); return; }
    setSubmitting(true);
    try {
      const planUpload = planFile ? await uploadFile(planFile) : null;
      const recordUpload = recordFile ? await uploadFile(recordFile) : null;
      const firstScope = hostScope;
      const response = await apiFetch('/api/activities/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, scope_type: firstScope.type, scope_name: firstScope.name, scope_names: selectedScopes.map(({ type, name }) => ({ type, name })), leader_ids: leaderIds, ...(submissionId ? { submission_id: submissionId } : {}), plan_file_url: planUpload?.url || existingPlanUrl, plan_file_name: planUpload?.fileName || existingPlanName, record_file_url: recordUpload?.url || existingRecordUrl, record_file_name: recordUpload?.fileName || existingRecordName, registration_start_time: new Date(form.registration_start_time).toISOString(), registration_end_time: new Date(form.registration_end_time).toISOString(), start_time: new Date(form.start_time).toISOString(), end_time: new Date(form.end_time).toISOString() }) });
      const data = await response.json(); if (!data.success) throw new Error(data.error || '提交失败');
      setSuccess(true); setSubmissionId(null); setForm({ full_name: '', registration_start_time: '', registration_end_time: '', start_time: '', end_time: '', category: '', category_primary: '', category_secondary: '', level: '' }); setCohostScopes([]); setLeaderIds(user ? [user.id] : []); setPlanFile(null); setRecordFile(null); setExistingPlanUrl(null); setExistingPlanName(null); setExistingRecordUrl(null); setExistingRecordName(null);
      if (new URLSearchParams(window.location.search).has('submissionId')) router.replace('/submit');
    } catch (error) { alert(error instanceof Error ? error.message : '提交失败'); } finally { setSubmitting(false); }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4"><div className="w-full max-w-sm rounded-lg border bg-white p-6 text-center"><LogIn className="mx-auto mb-3 h-8 w-8 text-teal-700" /><h2 className="text-lg font-semibold">需要登录</h2><p className="my-4 text-sm text-gray-500">请登录后提交活动信息</p><Link href="/login?redirect=/submit" className="inline-flex w-full justify-center rounded-md bg-teal-700 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;
  if (!hasPermission(user, 'canSubmitActivity')) return <div className="flex min-h-screen items-center justify-center p-4"><div className="rounded-lg border bg-white p-6 text-center"><h2 className="font-semibold">暂无活动提交权限</h2><p className="my-4 text-sm text-gray-500">请联系管理员开通活动提交权限。</p><Link href="/" className="text-sm text-teal-700">返回首页</Link></div></div>;

  const sectionClass = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
  return <DashboardLayout user={user}><div className="mx-auto max-w-4xl space-y-5">
    {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">提交成功，已进入审核队列。<Link href="/submit/status" className="ml-1 font-medium underline">查看提交状态</Link></div>}
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5"><div><p className="text-xs font-medium uppercase text-teal-600">活动工作台</p><h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-900">{submissionId ? '重新提交活动信息' : '提交活动信息'}</h2></div><p className="rounded-full bg-slate-50 px-3 py-1.5 text-xs text-slate-600">实际提交人：{user.name || user.username}（当前登录账号）</p></div>
      <div className="mt-6 space-y-5">
        <section className={sectionClass}><h3 className="text-sm font-semibold text-slate-900">基本信息</h3><label className="mt-4 block text-sm font-medium text-slate-700">活动全称 *<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} placeholder="请输入活动全称" /></label></section>
        <section className={sectionClass}><h3 className="text-sm font-semibold text-slate-900">时间安排</h3><div className="mt-4 grid gap-4 lg:grid-cols-2"><label className="text-sm font-medium text-slate-700">活动报名开始时间 *<input type="datetime-local" value={form.registration_start_time} onChange={(e) => setForm({ ...form, registration_start_time: e.target.value })} className={inputClass} /></label><label className="text-sm font-medium text-slate-700">活动报名结束时间 *<input type="datetime-local" value={form.registration_end_time} onChange={(e) => setForm({ ...form, registration_end_time: e.target.value })} className={inputClass} /></label><label className="text-sm font-medium text-slate-700">活动开始时间 *<input type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className={inputClass} /></label><label className="text-sm font-medium text-slate-700">活动结束时间 *<input type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className={inputClass} /></label></div></section>
        <section className={sectionClass}><h3 className="text-sm font-semibold text-slate-900">分类与级别</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium text-slate-700">德智体美劳 *<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, category_primary: '', category_secondary: '' })} className={inputClass}><option value="">请选择分类</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium text-slate-700">一级分类 *<select value={form.category_primary} onChange={(e) => setForm({ ...form, category_primary: e.target.value, category_secondary: '' })} className={inputClass} disabled={!form.category}><option value="">请选择一级分类</option>{(CATEGORY_DETAILS[form.category as Category] ? Object.keys(CATEGORY_DETAILS[form.category as Category]) : []).map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium text-slate-700">二级分类 *<select value={form.category_secondary} onChange={(e) => setForm({ ...form, category_secondary: e.target.value })} className={inputClass} disabled={!form.category_primary}><option value="">请选择二级分类</option>{(form.category && form.category_primary ? CATEGORY_DETAILS[form.category as Category]?.[form.category_primary] || [] : []).map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium text-slate-700">活动级别 *<select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className={inputClass}><option value="">请选择级别</option>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label></div></section>
        <section className={sectionClass}><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-900">主办与负责人</h3><span className="text-xs text-slate-500">主办单位必须是自己的部门或班级</span></div><div className="mt-4 grid gap-4 lg:grid-cols-3"><label className="text-sm font-medium text-slate-700">主办单位 *<select value={hostScope ? `${hostScope.type}:${hostScope.name}` : ''} onChange={(e) => handleHostScopeChange(e.target.value)} className={inputClass}><option value="">请选择自己的部门或班级</option>{hostScopes.map((scope) => <option key={`${scope.type}:${scope.name}`} value={`${scope.type}:${scope.name}`}>{scope.label}</option>)}</select></label><label className="text-sm font-medium text-slate-700">联办单位（可选，可多选）<select aria-describedby="cohost-scope-hint" multiple value={cohostScopes.map((scope) => `${scope.type}:${scope.name}`)} onChange={(e) => { const values = Array.from(e.target.selectedOptions, (option) => option.value); setCohostScopes(values.map((value) => cohostCandidates.find((scope) => `${scope.type}:${scope.name}` === value)).filter((scope): scope is ActivityScope => Boolean(scope))); }} className={`${inputClass} min-h-32`} disabled={!hostScope}>{cohostCandidates.map((scope) => <option key={`${scope.type}:${scope.name}`} value={`${scope.type}:${scope.name}`}>{scope.label}</option>)}</select><span id="cohost-scope-hint" className="mt-1 block text-xs font-normal text-slate-500">可不选；只能选择与主办单位同类型的部门或班级。</span></label><label className="text-sm font-medium text-slate-700">活动负责人（可多选） *<select multiple value={leaderIds} onChange={(e) => setLeaderIds(Array.from(e.target.selectedOptions, (option) => option.value))} className={`${inputClass} min-h-32`}>{leaders.map((leader) => <option key={leader.id} value={leader.id}>{leader.username}（{leader.student_id}）</option>)}</select></label></div></section>
        <section className={sectionClass}><h3 className="text-sm font-semibold text-slate-900">提交材料</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><FilePicker label="活动策划书 *" file={planFile} existingUrl={existingPlanUrl} existingName={existingPlanName} onChange={setPlanFile} /><FilePicker label="活动备案表 *" file={recordFile} existingUrl={existingRecordUrl} existingName={existingRecordName} onChange={setRecordFile} /></div></section>
      </div>
      <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5"><button onClick={handleSubmit} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"><Send className="h-4 w-4" />{submitting ? '提交中...' : submissionId ? '重新提交活动' : '提交活动'}</button>{hasPermission(user, 'canViewSubmissionStatus') && <Link href="/submit/status" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"><Eye className="h-4 w-4" />查看提交状态</Link>}</div>
    </div>
  </div></DashboardLayout>;
}

function FilePicker({ label, file, existingUrl, existingName, onChange }: { label: string; file: File | null; existingUrl: string | null; existingName: string | null; onChange: (file: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const isImage = Boolean(file?.type.startsWith('image/'));

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <div className="block text-sm font-medium">{label}<label className={'mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm font-normal ' + (file ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'text-gray-500')}><Upload className="h-4 w-4" /><span className="truncate">{file?.name || existingName || (existingUrl ? '已上传文件，选择新文件可替换' : '选择文件')}</span><input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => onChange(e.target.files?.[0] || null)} /></label>{isImage && preview && <ImageUploadPreviews imageUrls={[preview]} altPrefix={label.replace(' *', '')} onRemove={() => onChange(null)} />}</div>;
}
