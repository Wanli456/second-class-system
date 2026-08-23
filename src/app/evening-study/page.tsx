'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronDown, ChevronUp, LogIn, Search, Users } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { PageErrorDialog } from '@/components/PageErrorDialog';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';

interface SlipRecord {
  id: string;
  class_names: string;
  leave_type: string;
  activity_name: string | null;
  start_time: string | null;
  end_time: string | null;
  review_status: string;
  created_at: string;
}
interface StudentRecord {
  id: string;
  slip_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
}
interface QueryResult {
  success?: boolean;
  data?: SlipRecord[];
  students?: StudentRecord[];
  error?: string;
}
interface PersonRow { id: string; student_id: string; student_name: string; class_name: string; leave_type: string; start_time: string | null; end_time: string | null; }

const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

function businessDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function today() { return businessDate(new Date()); }
function formatTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: BUSINESS_TIME_ZONE, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '未填写';
}

export default function EveningStudyPage() {
  const { user, initialized } = useUser();
  const [className, setClassName] = useState('');
  const [date, setDate] = useState(today);
  const [persons, setPersons] = useState<Record<'approved' | 'pending' | 'rejected', PersonRow[]>>({ approved: [], pending: [], rejected: [] });
  const [dutyNames, setDutyNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<'approved' | 'pending' | 'rejected' | 'duty' | null>(null);
  const canView = hasPermission(user, 'canViewEveningStudy') || hasPermission(user, 'canQueryLeave');

  useEffect(() => { if (user?.className) setClassName(user.className); }, [user?.className]);

  const search = async () => {
    if (!className.trim() || !date) { setError('请选择班级和查询日期'); return; }
    setError('');
    setLoading(true);
    try {
      const response = await apiFetch(`/api/leave-slips?class=${encodeURIComponent(className.trim())}&date=${encodeURIComponent(date)}`);
      const data: QueryResult = await response.json();
      if (!data.success) throw new Error(data.error || '查询失败');
      const slips = data.data || [];
      const students = data.students || [];
      const rows: PersonRow[] = students.map((student) => {
        const slip = slips.find((item) => item.id === student.slip_id);
        return {
          id: student.id,
          student_id: student.student_id,
          student_name: student.student_name,
          class_name: student.class_name,
          leave_type: slip?.leave_type || '-',
          start_time: slip?.start_time || null,
          end_time: slip?.end_time || null,
        };
      });
      setPersons({
        approved: rows.filter((row) => slips.find((slip) => slip.id === students.find((student) => student.student_id === row.student_id)?.slip_id)?.review_status === '已通过'),
        pending: rows.filter((row) => slips.find((slip) => slip.id === students.find((student) => student.student_id === row.student_id)?.slip_id)?.review_status === '待查对'),
        rejected: rows.filter((row) => slips.find((slip) => slip.id === students.find((student) => student.student_id === row.student_id)?.slip_id)?.review_status === '已驳回'),
      });

      try {
        const dutyResponse = await apiFetch(`/api/attendance-work?date=${encodeURIComponent(date)}&review_status=已通过`);
        const dutyData = await dutyResponse.json();
        if (dutyData.success) {
          const names = new Set<string>();
          for (const item of (dutyData.data || [])) {
            let dayNames: string[] = [];
            const rawSchedules = item.schedules;
            if (rawSchedules) {
              try {
                const schedules = JSON.parse(rawSchedules);
                if (Array.isArray(schedules)) {
                  const matched = schedules.find((schedule: { date?: string; students?: unknown; student_names?: unknown }) => schedule.date === date);
                  if (matched) {
                    const matchStudents = matched.students ?? matched.student_names;
                    if (Array.isArray(matchStudents)) dayNames = matchStudents.map(String).filter(Boolean);
                  }
                }
              } catch { dayNames = []; }
            }
            if (!dayNames.length) {
              const raw = item.student_names;
              const parsed = raw ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : [];
              if (Array.isArray(parsed)) dayNames = parsed.map(String).filter(Boolean);
            }
            dayNames.forEach((name: string) => names.add(name));
          }
          setDutyNames([...names]);
        }
      } catch {
        setDutyNames([]);
      }

      setExpanded(null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : '查询失败');
    } finally {
      setLoading(false);
    }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) {
    return (
      <DashboardLayout user={user} title="晚自习请假查询" activeNavHref="/evening-study">
        <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 text-center">
          <LogIn className="mx-auto mb-3 size-8 text-teal-700" />
          <h2 className="font-semibold">请先登录</h2>
          <p className="my-4 text-sm text-gray-500">登录后才能查询晚自习请假考勤。</p>
          <Link href="/login?redirect=/evening-study" className="rounded-md bg-teal-700 px-4 py-2 text-sm text-white">登录/注册</Link>
        </div>
      </DashboardLayout>
    );
  }
  if (!canView) {
    return (
      <DashboardLayout user={user} title="晚自习请假查询" activeNavHref="/evening-study">
        <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h2 className="font-semibold text-amber-900">暂无晚自习查询权限</h2>
          <p className="my-4 text-sm text-amber-800">请联系管理员开通查询权限。</p>
          <Link href="/" className="text-sm text-teal-700">返回首页</Link>
        </div>
      </DashboardLayout>
    );
  }

  const approved = persons.approved;
  const pending = persons.pending;
  const rejected = persons.rejected;
  const people = expanded === 'duty' ? [] : expanded === 'approved' ? approved : expanded === 'pending' ? pending : rejected;

  return <DashboardLayout title="晚自习请假查询" user={user}><div className="mx-auto max-w-4xl space-y-4">
    <div className="rounded-lg border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-teal-700" /><h2 className="font-semibold">按日期和班级查询</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><label className="text-sm font-medium">班级<input value={className} onChange={(e) => setClassName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()} className="mt-1 w-full rounded-md border px-3 py-2 font-normal" placeholder="例如：计算机2101" /></label><label className="text-sm font-medium">日期<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-normal" /></label><button onClick={() => void search()} disabled={loading} className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm text-white disabled:opacity-50"><Search className="h-4 w-4" />{loading ? '查询中' : '查询'}</button></div></div>
    <div className="rounded-lg border bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-sm text-gray-600"><Users className="h-4 w-4" />{date} · {className} · 点击人数查看名单</div><div className="mt-4 grid gap-3 sm:grid-cols-4"><CountButton label="已通过" count={approved.length} active={expanded === 'approved'} onClick={() => setExpanded(expanded === 'approved' ? null : 'approved')} color="text-emerald-700" /><CountButton label="待查对" count={pending.length} active={expanded === 'pending'} onClick={() => setExpanded(expanded === 'pending' ? null : 'pending')} color="text-amber-700" /><CountButton label="已驳回" count={rejected.length} active={expanded === 'rejected'} onClick={() => setExpanded(expanded === 'rejected' ? null : 'rejected')} color="text-gray-500" /><CountButton label="考勤工作" count={dutyNames.length} active={expanded === 'duty'} onClick={() => setExpanded(expanded === 'duty' ? null : 'duty')} color="text-sky-700" /></div></div>
    {expanded === 'duty' ? (
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <h3 className="font-semibold">考勤工作人员名单</h3>
        {dutyNames.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {dutyNames.map((name) => <span key={name} className="rounded-md bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 ring-1 ring-sky-200">{name}</span>)}
          </div>
        ) : <p className="mt-4 text-sm text-gray-400">当天暂无已通过的考勤工作安排</p>}
      </div>
    ) : expanded ? (
      <div className="rounded-lg border bg-white p-5 shadow-sm"><h3 className="font-semibold">{expanded === 'approved' ? '已通过名单' : expanded === 'pending' ? '待查对名单' : '已驳回名单'}</h3>{people.length ? <div className="mt-3 divide-y">{people.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-medium">{item.student_name}（{item.student_id}）· {item.class_name}</span><span className="text-gray-500">{item.leave_type} · {formatTime(item.start_time)} 至 {formatTime(item.end_time)}</span></div>)}</div> : <p className="mt-4 text-sm text-gray-400">暂无人员</p>}</div>
    ) : null}
  </div>
      <PageErrorDialog open={Boolean(error)} message={error} onClose={() => setError('')} />
    </DashboardLayout>;
}

function CountButton({ label, count, active, onClick, color }: { label: string; count: number; active: boolean; onClick: () => void; color: string }) { return <button onClick={onClick} className={`flex items-center justify-between rounded-md border p-4 text-left transition-colors ${active ? 'border-slate-900 bg-slate-50' : 'hover:bg-gray-50'}`}><span className="text-sm text-gray-600">{label}</span><span className={`flex items-center gap-2 text-xl font-semibold ${color}`}>{count}<span className="text-gray-400">{active ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span></span></button>; }