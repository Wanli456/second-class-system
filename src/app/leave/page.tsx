'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileCheck2,
  FileText,
  LogIn,
  Search,
  Send,
  ShieldCheck,
  Upload,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { LEAVE_TYPES } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { includeApplicantStudent, selectAllClassStudents } from '@/lib/business-rules';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface RosterStudent { id: string; class_name: string; student_id: string; student_name: string; }
interface ActivityOption { id: string; full_name: string; }
interface LeaveGroup { id: string; applicant_user_id: string; }
interface LeaveRecord { id: string; student_id: string; class_name: string; student_name: string; leave_type: string; activity_name: string | null; activity_id?: string | null; leave_image_url: string | null; leave_image_name?: string | null; start_time: string; end_time: string; review_status: string; group_id?: string | null; applicant_user_id?: string | null; }

function localDateTime(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }

export default function LeavePage() {
  const router = useRouter();
  const { user, initialized } = useUser();
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [mode, setMode] = useState<'individual' | 'group'>('individual');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [leaveType, setLeaveType] = useState('');
  const [activityId, setActivityId] = useState('');
  const [activityList, setActivityList] = useState<ActivityOption[]>([]);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityReloadKey, setActivityReloadKey] = useState(0);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [existingImageName, setExistingImageName] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const classMembers = roster;
  const allClassStudentIds = useMemo(() => selectAllClassStudents(classMembers, user?.studentId), [classMembers, user?.studentId]);
  const canGroupLeave = user?.role === 'admin' || user?.canStartGroupLeave === true;
  const filteredActivities = useMemo(() => {
    const keyword = activitySearch.trim().toLowerCase();
    const matches = keyword
      ? activityList.filter((activity) => `${activity.full_name} ${activity.id}`.toLowerCase().includes(keyword))
      : activityList;
    return matches.slice(0, 50);
  }, [activityList, activitySearch]);
  const selectedActivity = useMemo(() => activityList.find((activity) => activity.id === activityId) || null, [activityId, activityList]);

  useEffect(() => {
    if (!user || (user.role !== 'admin' && !user.canStartGroupLeave)) return;
    apiFetch('/api/class-roster').then((res) => res.json()).then((data: { success?: boolean; data?: RosterStudent[] }) => { if (data.success) setRoster(data.data || []); }).catch(() => alert('读取班级花名册失败，请稍后重试'));
  }, [user]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('requestId'); setRequestId(id);
    if (!id) return;
    apiFetch(`/api/leave?id=${encodeURIComponent(id)}`).then((res) => res.json()).then((data: { success?: boolean; data?: LeaveRecord[]; group?: LeaveGroup | null; error?: string }) => {
      const records = data.success ? data.data || [] : [];
      const leave = records[0];
      if (!leave) { alert(data.error || '未找到原请假申请'); return; }
      if (records.some((item) => item.review_status === '已通过')) { alert('已通过的请假申请不能重新提交'); router.replace('/leave/status'); return; }
      if (leave.group_id && data.group?.applicant_user_id !== user?.id) { alert('只有集体请假的发起人可以重新提交'); router.replace('/leave/status'); return; }
      setMode(leave.group_id ? 'group' : 'individual'); setSelectedIds(includeApplicantStudent(records.map((item) => item.student_id), user?.studentId)); setLeaveType(leave.leave_type); setActivityId(leave.activity_id || ''); setStartTime(localDateTime(leave.start_time)); setEndTime(localDateTime(leave.end_time)); setExistingImageUrl(leave.leave_image_url); setExistingImageName(leave.leave_image_name || null); setImagePreview(leave.leave_image_url);
    }).catch(() => alert('读取原请假申请失败'));
  }, [router, user?.studentId]);

  useEffect(() => {
    if (leaveType !== '活动公假') {
      setActivityList([]);
      setActivityId('');
      setActivityError(null);
      setActivityLoading(false);
      return;
    }

    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);
    apiFetch('/api/activities?purpose=leave')
      .then((res) => res.json() as Promise<{ success?: boolean; data?: ActivityOption[]; error?: string }>)
      .then((data) => {
        if (cancelled) return;
        if (!data.success) throw new Error(data.error || '读取活动列表失败');
        setActivityList(data.data || []);
      })
      .catch((error: unknown) => {
        if (!cancelled) setActivityError(error instanceof Error ? error.message : '读取活动列表失败');
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });

    return () => { cancelled = true; };
  }, [activityReloadKey, leaveType]);

  useEffect(() => {
    if (!activityId) return;
    const selected = activityList.find((activity) => activity.id === activityId);
    if (selected) setActivitySearch(`${selected.full_name}（${selected.id}）`);
  }, [activityId, activityList]);

  useEffect(() => {
    if (mode !== 'group' || requestId || !classMembers.length) return;
    setSelectedIds(allClassStudentIds);
  }, [allClassStudentIds, classMembers.length, mode, requestId]);

  const toggleGroupMember = (studentId: string, checked: boolean) => {
    if (studentId === user?.studentId) return;
    setSelectedIds((current) => checked
      ? includeApplicantStudent([...current, studentId], user?.studentId)
      : current.filter((id) => id !== studentId),
    );
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; setImageFile(file); const reader = new FileReader(); reader.onload = () => setImagePreview(String(reader.result)); reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!user?.className || !leaveType || !startTime || !endTime) { alert('请填写请假类型和准确到分钟的开始、结束时间，并确保账号有班级信息'); return; }
    if (new Date(endTime) <= new Date(startTime)) { alert('结束时间必须晚于开始时间'); return; }
    if (leaveType === '活动公假' && !activityId) { alert('活动公假必须选择系统中的活动'); return; }
    if (mode === 'group' && !selectedIds.length) { alert('请选择至少一名本班学生'); return; }
    if (!imageFile && !existingImageUrl) { alert('请上传请假条图片'); return; }
    setSubmitting(true);
    try {
      let imageUrl = existingImageUrl;
      let imageName = existingImageName;
      if (imageFile) { const body = new FormData(); body.append('file', imageFile); const upload = await apiFetch('/api/upload', { method: 'POST', body }); const data = await upload.json(); if (!data.success) throw new Error(data.error || '图片上传失败'); imageUrl = data.url; imageName = data.file_name || imageFile.name; }
      const response = await apiFetch('/api/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ...(requestId ? { leave_request_id: requestId } : {}), student_ids: selectedIds, leave_type: leaveType, activity_id: leaveType === '活动公假' ? activityId : null, start_time: new Date(startTime).toISOString(), end_time: new Date(endTime).toISOString(), leave_image_url: imageUrl, leave_image_name: imageName }) });
      const data = await response.json(); if (!data.success) throw new Error(data.error || '提交失败');
      setSuccess(true); setRequestId(null); setLeaveType(''); setActivityId(''); setActivitySearch(''); setStartTime(''); setEndTime(''); setSelectedIds([]); setImageFile(null); setImagePreview(null); setExistingImageUrl(null); setExistingImageName(null); router.replace('/leave');
    } catch (error) { alert(error instanceof Error ? error.message : '提交失败'); } finally { setSubmitting(false); }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <LogIn className="size-5" />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">请先登录</h2>
        <p className="mt-2 text-sm text-slate-500">登录后才能提交请假申请。</p>
        <Button asChild className="mt-6 w-full bg-slate-950 hover:bg-slate-800">
          <Link href="/login?redirect=/leave">登录/注册</Link>
        </Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout user={user} title={requestId ? '重新提交请假' : '提交请假申请'} activeNavHref="/leave">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-teal-700">
              <span className="size-2 rounded-full bg-teal-600" />
              请假管理
            </div>
            <h2 className="mt-2 text-2xl font-bold text-slate-950 text-balance sm:text-3xl">
              {requestId ? '重新提交请假申请' : '提交请假申请'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 text-pretty">
              请填写请假类型、时间和请假条，提交内容会绑定当前登录账号。
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
            <ShieldCheck className="size-4 text-teal-700" />
            信息提交后进入审核
          </div>
        </header>

        {success && (
          <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <p>
              <span className="font-semibold">请假申请已提交。</span>
              <Link href="/leave/status" className="ml-2 font-medium underline underline-offset-4 hover:text-emerald-950">查看状态</Link>
            </p>
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
                <FileCheck2 className="size-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-950">申请信息</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">带有“必填”标记的内容需要完整填写。</p>
              </div>
            </div>

            <div className="space-y-8 p-5 sm:p-7">
              <section aria-labelledby="account-info-title">
                <SectionHeading number="01" title="账号信息" description="以下内容来自当前登录账号，不可手动修改。" id="account-info-title" />
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <ReadOnly label="学号" value={user.studentId || ''} />
                  <ReadOnly label="姓名" value={user.name || user.username || ''} />
                  <ReadOnly label="班级" value={user.className || '未填写'} />
                </div>
              </section>

              <fieldset>
                <SectionHeading number="02" title="请假方式" required id="leave-mode-title" />
                <div aria-labelledby="leave-mode-title" className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    checked={mode === 'individual'}
                    icon={UserRound}
                    title="个人请假"
                    description="仅提交当前账号的请假记录"
                    onChange={() => setMode('individual')}
                  />
                  {canGroupLeave && (
                    <ChoiceCard
                      checked={mode === 'group'}
                      icon={UsersRound}
                      title="班级集体请假"
                      description="默认选择本班全体学生"
                      onChange={() => { setMode('group'); setSelectedIds(allClassStudentIds); }}
                    />
                  )}
                </div>
              </fieldset>

              {mode === 'group' && (
                <fieldset className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 sm:p-5">
                  <legend className="flex flex-col gap-2 text-sm font-semibold text-slate-950 sm:flex-row sm:items-start sm:justify-between">
                    <span>本班请假学生 <RequiredMark /></span>
                    <span className="w-fit rounded-full bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-teal-800 ring-1 ring-teal-200">
                      已选 {selectedIds.length} 人
                    </span>
                  </legend>
                  {classMembers.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-800">
                      本班尚未维护花名册，请联系管理员导入后再发起集体请假。
                    </p>
                  ) : (
                    <>
                      <div className="mt-4 max-h-60 space-y-1 overflow-y-auto rounded-lg border border-teal-100 bg-white p-2">
                        {classMembers.map((member) => {
                          const isApplicant = member.student_id === user.studentId;
                          const isSelected = selectedIds.includes(member.student_id);
                          return (
                            <label key={member.id} className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-50',
                              isSelected && 'bg-teal-50/70',
                              isApplicant && 'cursor-default',
                            )}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isApplicant}
                                onChange={(event) => toggleGroupMember(member.student_id, event.target.checked)}
                                className="size-4 rounded border-slate-300 text-teal-700 accent-teal-700 focus:ring-teal-600"
                              />
                              <span className="min-w-0 flex-1 truncate text-slate-700">{member.student_name}（{member.student_id}）</span>
                              {isApplicant && <span className="shrink-0 text-xs font-medium text-teal-700">发起人</span>}
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-600">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-teal-700" />
                        已默认选择本班全体学生；取消勾选不请假的学生即可。发起人会自动包含，审核时按整组处理。
                      </p>
                    </>
                  )}
                </fieldset>
              )}

              <fieldset>
                <SectionHeading number="03" title="请假类型" required id="leave-type-title" />
                <div aria-labelledby="leave-type-title" className="mt-4 grid gap-3 sm:grid-cols-3">
                  {LEAVE_TYPES.map((type) => (
                    <ChoiceCard
                      key={type}
                      checked={leaveType === type}
                      icon={type === '活动公假' ? CalendarClock : type === '病假' ? ShieldCheck : FileText}
                      title={type}
                      description={type === '活动公假' ? '需选择已审核活动' : type === '病假' ? '填写病假相关信息' : '填写个人事务信息'}
                      onChange={() => { setLeaveType(type); setActivityId(''); setActivitySearch(''); }}
                    />
                  ))}
                </div>
              </fieldset>

              {leaveType === '活动公假' && (
                <fieldset>
                  <SectionHeading number="04" title="关联活动" required id="activity-title" />
                  <div className="relative mt-4">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={activitySearch}
                      onChange={(event) => { setActivitySearch(event.target.value); setActivityId(''); setActivityPickerOpen(true); }}
                      onFocus={() => setActivityPickerOpen(true)}
                      onBlur={() => window.setTimeout(() => setActivityPickerOpen(false), 120)}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                      placeholder="输入活动名称或活动 ID 搜索"
                      role="combobox"
                      aria-expanded={activityPickerOpen}
                      aria-controls="activity-options"
                      aria-autocomplete="list"
                      aria-describedby="activity-search-hint"
                    />
                    <span className="sr-only">当前已选择活动 ID：{activityId || '未选择'}</span>
                    {activityPickerOpen && (
                      <div id="activity-options" role="listbox" className="absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                        {activityLoading ? <p className="px-3 py-5 text-center text-sm text-slate-500">正在加载已审核活动...</p>
                          : activityError ? <div className="space-y-2 px-3 py-4 text-center text-sm text-red-600"><p>{activityError}</p><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setActivityReloadKey((value) => value + 1)} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">重新加载</button></div>
                            : filteredActivities.length ? filteredActivities.map((activity) => <button type="button" role="option" aria-selected={activity.id === activityId} key={activity.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setActivityId(activity.id); setActivitySearch(`${activity.full_name}（${activity.id}）`); setActivityPickerOpen(false); }} className={cn('block w-full rounded-md px-3 py-2.5 text-left text-sm hover:bg-slate-50', activity.id === activityId && 'bg-teal-50 text-teal-800')}><span className="block truncate font-medium">{activity.full_name}</span><span className="mt-0.5 block text-xs text-slate-500">活动 ID：{activity.id}</span></button>)
                              : <p className="px-3 py-5 text-center text-sm text-slate-500">{activityList.length ? '没有匹配的已审核活动' : '暂无已审核活动可用于活动公假'}</p>}
                      </div>
                    )}
                  </div>
                  {selectedActivity && <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm"><span className="font-medium text-teal-800">已选择</span><span className="min-w-0 truncate font-semibold text-slate-900">{selectedActivity.full_name}</span><span className="text-xs tabular-nums text-teal-700">{selectedActivity.id}</span></div>}
                  <span id="activity-search-hint" className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-slate-500"><AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />共 {activityList.length} 个已审核活动，可按名称或唯一活动 ID筛选，提交时按活动 ID绑定{activityList.length > 50 ? '，结果最多显示 50 条' : ''}。</span>
                </fieldset>
              )}

              <fieldset>
                <SectionHeading number={leaveType === '活动公假' ? '05' : '04'} title="请假时间" required id="leave-time-title" />
                <div aria-labelledby="leave-time-title" className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DateTimeField label="请假开始时间" value={startTime} onChange={setStartTime} />
                  <DateTimeField label="请假结束时间" value={endTime} onChange={setEndTime} />
                </div>
              </fieldset>

              <fieldset>
                <SectionHeading number={leaveType === '活动公假' ? '06' : '05'} title="请假条图片" required id="leave-image-title" />
                <label className="mt-4 block">
                  <span className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-slate-50 px-4 py-4 transition-colors hover:border-teal-400 hover:bg-teal-50/40 focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-100',
                    imagePreview ? 'border-teal-200' : 'border-slate-300',
                  )}>
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-slate-200"><Upload className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{imageFile?.name || existingImageName || (existingImageUrl ? '已上传图片，选择新图片可替换' : '选择请假条图片')}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">支持常见图片格式，点击此处选择文件</span>
                    </span>
                    <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">选择文件</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={handleImageChange} aria-labelledby="leave-image-title" />
                  </span>
                  {imagePreview && (
                    <span className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                      <img src={imagePreview} alt="请假条预览" className="size-16 shrink-0 rounded-md border border-slate-200 object-contain" />
                      <span className="min-w-0"><span className="block text-sm font-medium text-slate-800">已添加请假条</span><span className="mt-1 block truncate text-xs text-slate-500">{imageFile?.name || existingImageName || '已上传图片'}</span></span>
                    </span>
                  )}
                </label>
              </fieldset>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-5 sm:flex-row sm:items-center sm:px-7">
              <Button type="button" onClick={handleSubmit} disabled={submitting} className="h-11 bg-slate-950 px-5 hover:bg-slate-800">
                <Send className="size-4" />
                {submitting ? '提交中...' : requestId ? '重新提交申请' : '提交申请'}
              </Button>
              <Button type="button" variant="outline" asChild className="h-11 bg-white px-5">
                <Link href="/leave/status"><Eye className="size-4" />查看请假状态</Link>
              </Button>
              <span className="text-xs text-slate-500 sm:ml-auto">请确认时间准确到分钟</span>
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><ShieldCheck className="size-4 text-teal-700" />提交前确认</div>
              <ul className="mt-4 space-y-3 text-sm leading-5 text-slate-600">
                <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" />请假开始和结束时间需具体到分钟。</li>
                <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" />活动公假需要绑定已审核活动。</li>
                {canGroupLeave && <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" />集体请假默认包含本班全体学生。</li>}
                <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" />请假条图片会随申请一并提交。</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase text-slate-500">当前账号</p>
              <p className="mt-2 truncate text-sm font-semibold text-slate-900">{user.name || user.username}</p>
              <p className="mt-1 truncate text-xs tabular-nums text-slate-500">{user.studentId || '未填写学号'} · {user.className || '未填写班级'}</p>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SectionHeading({ id, number, title, description, required }: { id: string; number: string; title: string; description?: string; required?: boolean }) {
  return (
    <div id={id}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold tabular-nums text-teal-700">{number}</span>
        <span className="h-px w-5 bg-teal-200" />
        <h3 className="text-sm font-semibold text-slate-950">{title} {required && <RequiredMark />}</h3>
      </div>
      {description && <p className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>}
    </div>
  );
}

function RequiredMark() {
  return <span aria-hidden="true" className="text-rose-600">*</span>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-xs font-semibold text-slate-500">
      {label}
      <input readOnly value={value} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none" />
    </label>
  );
}

function ChoiceCard({ checked, icon: Icon, title, description, onChange }: { checked: boolean; icon: LucideIcon; title: string; description: string; onChange: () => void }) {
  return (
    <label className="group relative cursor-pointer">
      <input type="radio" checked={checked} onChange={onChange} className="peer sr-only" />
      <span className={cn(
        'flex min-h-16 items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-teal-100',
        checked ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
      )}>
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', checked ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-500')}><Icon className="size-4" /></span>
        <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{description}</span></span>
        <span className={cn('ml-auto size-4 shrink-0 rounded-full border-2', checked ? 'border-[5px] border-teal-700' : 'border-slate-300')} />
      </span>
    </label>
  );
}

function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label} <RequiredMark />
      <span className="relative mt-2 block">
        <CalendarClock className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-teal-700" />
        <input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />
      </span>
    </label>
  );
}
