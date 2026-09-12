'use client';

import { useCallback, useEffect, useState, type JSX } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Info, RefreshCw, Users } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { useUser } from '@/contexts/UserContext';

interface ClassAttendanceRow {
  class_name: string;
  expected_count: number;
  present_count: number;
  leave_count: number;
  attendance_worker_count: number;
  present_source: 'recorded' | 'auto';
}
interface ClassAttendanceResponse {
  success?: boolean;
  data?: ClassAttendanceRow[];
  error?: string;
}

function businessToday(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
}

export default function ClassAttendancePage() {
  const { initialized } = useUser();
  const [date, setDate] = useState(businessToday);
  const [rows, setRows] = useState<ClassAttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({});

  const loadSummary = useCallback(async (targetDate: string): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/class-attendance?date=' + encodeURIComponent(targetDate), { cache: 'no-store' });
      const result = await response.json() as ClassAttendanceResponse;
      if (!response.ok || !result.success) throw new Error(result.error || '统计加载失败');
      setRows(result.data || []);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : '统计加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized) void loadSummary(date);
  }, [date, initialized, loadSummary]);

  if (!initialized) return <AuthLoadingScreen />;

  const totals = rows.reduce(
    (summary, row) => ({
      expected: summary.expected + row.expected_count,
      present: summary.present + row.present_count,
      leave: summary.leave + row.leave_count,
      workers: summary.workers + row.attendance_worker_count,
    }),
    { expected: 0, present: 0, leave: 0, workers: 0 },
  );
  const gradeOf = (className: string) => {
    const match = className.match(/(\d{4})$/);
    return match ? `${match[1].slice(0, 2)}级` : '未分年级';
  };
  const grades = Object.entries(rows.reduce<Record<string, ClassAttendanceRow[]>>((groups, row) => {
    (groups[gradeOf(row.class_name)] ||= []).push(row);
    return groups;
  }, {}));

  return (
    <DashboardLayout title="班级考勤统计" activeNavHref="/class-attendance">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="size-5 text-teal-700" />
                <h2 className="text-lg font-semibold text-slate-950">各班出勤汇总</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">所有用户均可查看；页面只展示人数汇总，不公开请假学生名单。</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <CalendarDays className="size-4 text-slate-500" />
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <button type="button" onClick={() => void loadSummary(date)} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
                刷新
              </button>
            </div>
          </div>
        </section>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="应到总人数" value={totals.expected} />
          <SummaryCard label="实到总人数" value={totals.present} />
          <SummaryCard label="请假总人数" value={totals.leave} />
          <SummaryCard label="当天考勤人员" value={totals.workers} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-950">{date} · 年级汇总</h3>
            <span className="text-sm text-slate-500">共 {grades.length} 个年级、{rows.length} 个班级</span>
          </div>
          {rows.length ? (
            <div className="divide-y divide-slate-100">
              {grades.map(([grade, gradeRows]) => {
                const gradeTotals = gradeRows.reduce((sum, row) => ({ expected: sum.expected + row.expected_count, present: sum.present + row.present_count, leave: sum.leave + row.leave_count, workers: sum.workers + row.attendance_worker_count }), { expected: 0, present: 0, leave: 0, workers: 0 });
                const expanded = Boolean(expandedGrades[grade]);
                return <div key={grade}>
                  <button type="button" onClick={() => setExpandedGrades((current) => ({ ...current, [grade]: !expanded }))} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
                    {expanded ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
                    <span className="font-semibold text-slate-950">{grade}</span><span className="text-sm text-slate-500">{gradeRows.length} 个班级</span>
                    <span className="ml-auto text-sm text-slate-600">应到 {gradeTotals.expected} · 实到 <b className="text-emerald-700">{gradeTotals.present}</b> · 请假 <b className="text-amber-700">{gradeTotals.leave}</b></span>
                  </button>
                  {expanded && <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="px-12 py-3 font-semibold">班级</th><th className="px-5 py-3 font-semibold">应到</th><th className="px-5 py-3 font-semibold">实到</th><th className="px-5 py-3 font-semibold">请假</th><th className="px-5 py-3 font-semibold">考勤人员</th><th className="px-5 py-3 font-semibold">实到来源</th></tr></thead><tbody className="divide-y divide-slate-100">{gradeRows.map((row) => <tr key={row.class_name} className="text-slate-700"><td className="px-12 py-3 font-medium text-slate-950">{row.class_name}</td><td className="px-5 py-3">{row.expected_count}</td><td className="px-5 py-3 font-semibold text-emerald-700">{row.present_count}</td><td className="px-5 py-3 text-amber-700">{row.leave_count}</td><td className="px-5 py-3 text-teal-700">{row.attendance_worker_count}</td><td className="px-5 py-3 text-slate-500">{row.present_source === 'recorded' ? '已录入考勤' : '自动计算（应到−请假−考勤）'}</td></tr>)}</tbody></table></div>}
                </div>;
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center text-sm text-slate-500">当前日期暂无班级花名册数据。</div>
          )}
        </section>

        <div className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <Info className="mt-0.5 size-4 shrink-0" />
              <p>应到为班级花名册人数；普通请假为已通过的请假人数；考勤为当天被安排执行考勤且属于本班花名册的学生；自动计算的实到为应到减去普通请假和考勤。</p>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
