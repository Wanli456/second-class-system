'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, FileImage, Search } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { FilePreviewLink } from '@/components/FilePreviewDialog';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { parseLeaveSlipArray as parseJsonArray } from '@/lib/leave-slip-array';

type LeaveSlip = {
  id: string;
  slip_type: string;
  leave_type: string;
  class_names: string;
  activity_id: string | null;
  activity_name: string | null;
  applicant_name: string | null;
  applicant_student_id: string | null;
  leave_image_url: string | null;
  leave_image_name: string | null;
  review_status: string;
  original_slip_id: string | null;
  start_time: string | null;
  end_time: string | null;
};

type OriginalSlip = {
  id: string;
  activity_id: string | null;
  activity_name: string | null;
  class_names: string | null;
  student_names: string | null;
  image_url: string | null;
  image_name: string | null;
  image_list: string | null;
  notes: string | null;
};

type SlipStudent = { slip_id: string; student_id: string; student_name: string; class_name: string };

function originalImage(original: OriginalSlip): { url: string; name: string } | null {
  if (original.image_url) return { url: original.image_url, name: original.image_name || '原假条图片' };
  try {
    const images = JSON.parse(original.image_list || '[]');
    if (Array.isArray(images) && images[0]?.url) return { url: String(images[0].url), name: String(images[0].name || '原假条图片') };
  } catch {
    // 旧数据没有图片列表时已使用 image_url 回退。
  }
  return null;
}

export default function LeaveSlipComparePage() {
  const { user, initialized } = useUser();
  const [keyword, setKeyword] = useState('');
  const [slips, setSlips] = useState<LeaveSlip[]>([]);
  const [students, setStudents] = useState<SlipStudent[]>([]);
  const [originals, setOriginals] = useState<OriginalSlip[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingSlipId, setEditingSlipId] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editActivityName, setEditActivityName] = useState('');
  const [editActivityId, setEditActivityId] = useState('');
  const [activityOptions, setActivityOptions] = useState<Array<{ id: string; full_name: string }>>([]);
  const [activitySearch, setActivitySearch] = useState('');
  const [editLeaveType, setEditLeaveType] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const canQuery = hasPermission(user, 'canQueryLeave');
  const canManageOriginals = hasPermission(user, 'canManageOriginalLeave');
  const canReview = hasPermission(user, 'canReviewLeave');
  const canCompare = canManageOriginals;
  const canEdit = user?.role === 'admin' || (user?.role === 'leader' && user.department === '学习竞技部');

  const selectedSlip = useMemo(() => slips.find((slip) => slip.id === editingSlipId) || null, [slips, editingSlipId]);

  const selectSlipForEdit = (id: string) => {
    setEditingSlipId(id);
    const slip = slips.find((item) => item.id === id);
    setEditActivityName(slip?.activity_name || '');
    setEditActivityId(slip?.activity_id || '');
    setActivitySearch(slip?.activity_name || '');
    setEditLeaveType(slip?.leave_type || '');
    setEditStartTime(slip?.start_time ? slip.start_time.slice(0, 16) : '');
    setEditEndTime(slip?.end_time ? slip.end_time.slice(0, 16) : '');
    setIsEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    if (savingEdit) return;
    setIsEditDialogOpen(false);
    setEditingSlipId('');
  };

  const saveEdit = async () => {
    if (!selectedSlip) return;
    setSavingEdit(true);
    try {
      const response = await apiFetch('/api/leave-slips', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedSlip.id,
          activity_id: editActivityId || null,
          activity_name: editActivityName,
          leave_type: editLeaveType,
          start_time: editStartTime,
          end_time: editEndTime,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || '修改失败');
      setIsEditDialogOpen(false);
      setEditingSlipId('');
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '修改失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const load = async () => {
    if (!canCompare) return;
    setLoading(true);
    try {
      const [slipResponse, originalResponse, activityResponse] = await Promise.all([
        apiFetch('/api/leave-slips'),
        apiFetch('/api/leave-slips/originals'),
        apiFetch('/api/activities'),
      ]);
      const [slipPayload, originalPayload, activityPayload] = await Promise.all([slipResponse.json(), originalResponse.json(), activityResponse.json()]);
      if (!slipPayload.success) throw new Error(slipPayload.error || '读取上传假条失败');
      if (!originalPayload.success) throw new Error(originalPayload.error || '读取原假条失败');
      setSlips(slipPayload.data || []);
      setStudents(slipPayload.students || []);
      setOriginals(originalPayload.data || []);
      if (activityResponse.ok && activityPayload.success) {
        setActivityOptions((Array.isArray(activityPayload.data) ? activityPayload.data : [])
          .map((activity: { id?: unknown; full_name?: unknown }) => ({ id: String(activity.id || ''), full_name: String(activity.full_name || '') }))
          .filter((activity: { id: string; full_name: string }) => activity.id && activity.full_name));
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '读取对比数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (initialized && user && canCompare) void load(); }, [initialized, user, canCompare]);

  const studentsBySlip = useMemo(() => {
    const result = new Map<string, SlipStudent[]>();
    for (const student of students) result.set(student.slip_id, [...(result.get(student.slip_id) || []), student]);
    return result;
  }, [students]);
  const originalsById = useMemo(() => new Map(originals.map((original) => [original.id, original])), [originals]);
  const pairs = useMemo(() => slips.flatMap((slip) => {
    const original = slip.original_slip_id ? originalsById.get(slip.original_slip_id) : undefined;
    return original ? [{ slip, original }] : [];
  }).filter(({ slip, original }) => {
    const query = keyword.trim().toLowerCase();
    return !query || [slip.class_names, slip.activity_name, slip.applicant_name, original.activity_name, original.activity_id, original.class_names, original.student_names].join(' ').toLowerCase().includes(query);
  }), [slips, originalsById, keyword]);

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><div className="rounded-xl border bg-white p-6 text-center"><h2 className="font-semibold">请先登录</h2><p className="mt-2 text-sm text-slate-500">登录后才能对比假条。</p><Link href="/login?redirect=/leave-slip/records/compare" className="mt-4 inline-block rounded-md bg-slate-950 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;

  return <DashboardLayout user={user} title="假条查看与对比" activeNavHref="/leave-slip/records">
    <div className="mx-auto w-full max-w-6xl">
      <Link href="/leave-slip/records" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="size-4" />返回假条查看与对比</Link>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase text-teal-700">假条管理</p>
        <h1 className="mt-2 text-balance text-2xl font-bold text-slate-950">上传假条与原假条对比</h1>
        <p className="mt-2 max-w-3xl text-pretty text-sm leading-6 text-slate-600">每一项都对应同一条关联记录：左侧是班级负责人上传的假条，右侧是活动方归档的原假条，可直接核对图片、学生、班级和活动信息。</p>
        <nav className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white p-1" aria-label="假条查看与对比功能"><Link href="/leave-slip/query" className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950">查看假条</Link><Link href="/leave-slip/records/compare" aria-current="page" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">对比假条</Link></nav>
      </header>
      {!canCompare ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><AlertCircle className="mx-auto size-6 text-amber-600" /><h2 className="mt-3 font-semibold text-amber-900">当前账号没有假条对比或查对权限</h2><p className="mt-2 text-sm text-amber-800">请联系管理员授予“假条对比权限”或“假条查对权限”。</p></div> : <>
        <div className="mb-6 flex gap-3 rounded-xl border border-slate-200 bg-white p-4"><label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="班级 / 学生 / 活动名称 / 活动 ID" /></label><Button type="button" onClick={() => void load()} disabled={loading} className="h-10 bg-slate-950 px-5 hover:bg-slate-800">{loading ? '加载中...' : '刷新'}</Button></div>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-950"><span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">1</span>已关联、可对比的假条（{pairs.length}）</h2>
        <div className="space-y-5">{pairs.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">暂无可对比记录。请先在假条查对中关联活动方原假条。</div> : pairs.map(({ slip, original }) => {
          const originalFile = originalImage(original);
          const memberRows = studentsBySlip.get(slip.id) || [];
return <article key={slip.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3"><div><span className="text-sm font-semibold text-slate-950">{slip.activity_name || original.activity_name || '未填写活动名称'}</span><span className="ml-2 text-xs text-slate-500">关联原假条：{original.id}</span></div><div className="flex items-center gap-2">{canEdit && <Button type="button" size="sm" variant="outline" onClick={() => selectSlipForEdit(slip.id)}>修改假条</Button>}<Link href={`/leave-slip/originals?keyword=${encodeURIComponent(original.activity_id || original.activity_name || '')}`} className="text-sm font-medium text-sky-700 hover:text-sky-900">维护原假条</Link></div></div><div className="grid divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0"><section className="p-5"><p className="text-xs font-semibold text-teal-700">班级负责人上传假条</p><h2 className="mt-1 font-semibold text-slate-950">{parseJsonArray(slip.class_names).join('、') || '未填写班级'} · {slip.leave_type}</h2><p className="mt-2 text-sm text-slate-600">上传人：{slip.applicant_name || '-'}（{slip.applicant_student_id || '-'}）</p><p className="mt-1 text-sm text-slate-600">学生：{memberRows.map((student) => `${student.student_name}（${student.student_id}）`).join('、') || '未填写'}</p>{slip.leave_image_url ? <div className="mt-4"><FilePreviewLink url={slip.leave_image_url} fileName={slip.leave_image_name || '上传假条图片'} label="查看上传假条" /></div> : <p className="mt-4 text-sm text-amber-700">未上传图片</p>}</section><section className="p-5"><p className="text-xs font-semibold text-sky-700">活动方归档原假条</p><h2 className="mt-1 font-semibold text-slate-950">{original.activity_name || '未填写活动名称'}</h2><p className="mt-2 text-sm text-slate-600">活动 ID：{original.activity_id || '-'}</p><p className="mt-1 text-sm text-slate-600">班级：{parseJsonArray(original.class_names).join('、') || '未填写'}</p><p className="mt-1 text-sm text-slate-600">学生：{parseJsonArray(original.student_names).join('、') || '未填写'}</p>{originalFile ? <div className="mt-4"><FilePreviewLink url={originalFile.url} fileName={originalFile.name} label="查看原假条" /></div> : <p className="mt-4 flex items-center gap-2 text-sm text-amber-700"><FileImage className="size-4" />原假条没有可查看图片</p>}</section></div></article>;
        })}</div>
      </>}
    </div>
      {canEdit && isEditDialogOpen && selectedSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-slip-title">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="edit-slip-title" className="text-lg font-semibold text-slate-900">修改假条</h2>
                <p className="mt-1 text-sm text-slate-600">保存后会解除原查对关联，并重新进入“待查对”状态。</p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={closeEditDialog} disabled={savingEdit}>关闭</Button>
            </div>
            <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                <p>可修改二课活动关联、请假类型和起止时间。</p>
                <p className="mt-1">学生名单、涉及班级和图片不可在此修改；如需变更，请回到上传页重新提交。</p>
              </div>
              <div>
                <label htmlFor="edit-activity-search" className="text-sm font-medium text-slate-700">活动名称</label>
                <input
                  id="edit-activity-search"
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  value={activitySearch}
                  onChange={(event) => {
                    const value = event.target.value;
                    setActivitySearch(value);
                    const matched = activityOptions.find((activity) => (activity.id + ' · ' + activity.full_name) === value || activity.full_name === value || activity.id === value);
                    setEditActivityId(matched?.id || '');
                    setEditActivityName(matched?.full_name || value);
                  }}
                  placeholder="输入活动名称或活动 ID 粗略搜索"
                />
                <label htmlFor="edit-activity-select" className="mt-3 block text-sm font-medium text-slate-700">从活动总表选择</label>
                <select
                  id="edit-activity-select"
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  value={editActivityId}
                  onChange={(event) => {
                    const activity = activityOptions.find((item) => item.id === event.target.value);
                    setEditActivityId(activity?.id || '');
                    if (activity) {
                      setEditActivityName(activity.full_name);
                      setActivitySearch(activity.full_name);
                    }
                  }}
                >
                  <option value="">不关联活动总表（保留手动填写名称）</option>
                  {activityOptions
                    .filter((activity) => {
                      const search = activitySearch.trim().toLowerCase();
                      return !search || activity.id.toLowerCase().includes(search) || activity.full_name.toLowerCase().includes(search);
                    })
                    .slice(0, 50)
                    .map((activity) => <option key={activity.id} value={activity.id}>{activity.id} · {activity.full_name}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500">先输入关键词粗略筛选，再从下拉框选择；选择后会保存对应的活动 ID 和活动名称。</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">涉及班级（按学生名单自动生成）</p>
                <p className="mt-1 min-h-10 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{parseJsonArray(selectedSlip.class_names).join('、') || '暂无班级信息'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">学生名单（只读）</p>
                <p className="mt-1 min-h-10 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{(studentsBySlip.get(selectedSlip.id) || []).map((student) => student.student_name + '（' + student.student_id + '）').join('、') || '暂无学生信息'}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-leave-type" className="text-sm font-medium text-slate-700">请假类型</label>
                  <select id="edit-leave-type" className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={editLeaveType} onChange={(event) => setEditLeaveType(event.target.value)}>
                    {(selectedSlip.slip_type === '其他请假' ? ['社团', '比赛', '培训', '虚拟工作室', '临时请假'] : ['事假', '病假', '活动公假']).map((leaveType) => <option key={leaveType} value={leaveType}>{leaveType}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-start-time" className="text-sm font-medium text-slate-700">开始时间</label>
                  <input id="edit-start-time" type="datetime-local" className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={editStartTime} onChange={(event) => setEditStartTime(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="edit-end-time" className="text-sm font-medium text-slate-700">结束时间</label>
                  <input id="edit-end-time" type="datetime-local" className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={editEndTime} onChange={(event) => setEditEndTime(event.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <Button type="button" variant="outline" onClick={closeEditDialog} disabled={savingEdit}>取消</Button>
                <Button type="submit" disabled={savingEdit}>{savingEdit ? '保存中…' : '保存修改'}</Button>
              </div>
            </form>
          </section>
        </div>
      )}
  </DashboardLayout>;
}
