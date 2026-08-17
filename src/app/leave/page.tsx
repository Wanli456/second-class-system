'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, LogIn, Send, Upload } from 'lucide-react';
import { LEAVE_TYPES } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { includeApplicantStudent, selectAllClassStudents } from '@/lib/business-rules';

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

  useEffect(() => {
    if (!user) return;
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
    if (leaveType !== '活动公假') { setActivityList([]); setActivityId(''); return; }
    apiFetch('/api/activities?purpose=leave').then((res) => res.json()).then((data: { success?: boolean; data?: ActivityOption[] }) => { if (data.success) setActivityList(data.data || []); }).catch(() => alert('读取活动列表失败'));
  }, [leaveType]);

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
      setSuccess(true); setRequestId(null); setLeaveType(''); setActivityId(''); setStartTime(''); setEndTime(''); setSelectedIds([]); setImageFile(null); setImagePreview(null); setExistingImageUrl(null); setExistingImageName(null); router.replace('/leave');
    } catch (error) { alert(error instanceof Error ? error.message : '提交失败'); } finally { setSubmitting(false); }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-screen items-center justify-center p-4"><div className="rounded-lg border bg-white p-6 text-center"><LogIn className="mx-auto mb-3 h-8 w-8 text-teal-700" /><h2 className="font-semibold">请先登录</h2><p className="my-4 text-sm text-gray-500">登录后才能提交请假申请</p><Link href="/login?redirect=/leave" className="rounded-md bg-teal-700 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;

  return <DashboardLayout user={user}><div className="mx-auto max-w-3xl space-y-4">
    {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">请假申请已提交。<Link href="/leave/status" className="ml-1 underline">查看状态</Link></div>}
    <div className="rounded-lg border bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">{requestId ? '重新提交请假申请' : '提交请假申请'}</h2><p className="mt-1 text-sm text-gray-500">学号、姓名和班级均读取自当前登录账号，不能手动修改。</p>
      <div className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3"><ReadOnly label="学号" value={user.studentId || ''} /><ReadOnly label="姓名" value={user.name || user.username || ''} /><ReadOnly label="班级" value={user.className || '未填写'} /></div>
        <div><span className="mb-2 block text-sm font-medium">请假方式 *</span><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={mode === 'individual'} onChange={() => setMode('individual')} />个人请假</label>{canGroupLeave && <label className="flex items-center gap-2"><input type="radio" checked={mode === 'group'} onChange={() => { setMode('group'); setSelectedIds(allClassStudentIds); }} />班级集体请假</label>}</div></div>
        {mode === 'group' && <fieldset className="rounded-md border border-teal-100 bg-teal-50 p-3"><legend className="px-1 text-sm font-medium">本班请假学生 *</legend>{classMembers.length === 0 ? <p className="mt-2 text-sm text-amber-700">本班尚未维护花名册，请联系管理员导入后再发起集体请假。</p> : <><div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border bg-white p-2">{classMembers.map((member) => { const isApplicant = member.student_id === user.studentId; const isSelected = selectedIds.includes(member.student_id); return <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50"><input type="checkbox" checked={isSelected} disabled={isApplicant} onChange={(event) => toggleGroupMember(member.student_id, event.target.checked)} /> <span>{member.student_name}（{member.student_id}）</span>{isApplicant && <span className="text-xs text-gray-500">发起人</span>}</label>; })}</div><p className="mt-2 text-xs text-gray-500">已默认选择本班全体学生；取消勾选不请假的学生即可。发起人会自动包含，审核时按整组处理。</p></>}</fieldset>}
        <div><span className="mb-2 block text-sm font-medium">请假类型 *</span><div className="flex flex-wrap gap-4 text-sm">{LEAVE_TYPES.map((type) => <label key={type} className="flex items-center gap-2"><input type="radio" checked={leaveType === type} onChange={() => { setLeaveType(type); setActivityId(''); }} />{type}</label>)}</div></div>
        {leaveType === '活动公假' && <label className="block text-sm font-medium">活动全称 *<select value={activityId} onChange={(e) => setActivityId(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-normal"><option value="">请选择已审核活动</option>{activityList.map((activity) => <option key={activity.id} value={activity.id}>{activity.full_name}（{activity.id}）</option>)}</select><span className="mt-1 flex items-center gap-1 text-xs text-amber-700"><AlertCircle className="h-3 w-3" />按唯一活动 ID 绑定活动，避免同名活动误匹配。</span></label>}
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">请假开始时间 *<input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-normal" /></label><label className="text-sm font-medium">请假结束时间 *<input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-normal" /></label></div>
        <label className="block text-sm font-medium">请假条图片 *<span className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm font-normal text-gray-500"><Upload className="h-4 w-4" /><span className="truncate">{imageFile?.name || existingImageName || (existingImageUrl ? '已上传图片，选择新图片可替换' : '选择图片')}</span><input type="file" accept="image/*" className="hidden" onChange={handleImageChange} /></span>{imagePreview && <img src={imagePreview} alt="请假条预览" className="mt-2 h-20 rounded border object-contain" />}</label>
      </div>
      <div className="mt-6 flex flex-wrap gap-3"><button onClick={handleSubmit} disabled={submitting} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-5 py-2 text-sm text-white disabled:opacity-50"><Send className="h-4 w-4" />{submitting ? '提交中...' : requestId ? '重新提交申请' : '提交申请'}</button><Link href="/leave/status" className="inline-flex items-center gap-2 rounded-md border px-5 py-2 text-sm"><Eye className="h-4 w-4" />查看请假状态</Link></div>
    </div>
  </div></DashboardLayout>;
}

function ReadOnly({ label, value }: { label: string; value: string }) { return <label className="text-sm font-medium">{label}<input readOnly value={value} className="mt-1 w-full rounded-md border bg-gray-50 px-3 py-2 text-sm font-normal text-gray-600" /></label>; }
