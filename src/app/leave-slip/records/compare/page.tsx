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

type LeaveSlip = {
  id: string;
  slip_type: string;
  leave_type: string;
  class_names: string;
  activity_name: string | null;
  applicant_name: string | null;
  applicant_student_id: string | null;
  leave_image_url: string | null;
  leave_image_name: string | null;
  review_status: string;
  original_slip_id: string | null;
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

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [value];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

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
  const canQuery = hasPermission(user, 'canQueryLeave');
  const canManageOriginals = hasPermission(user, 'canManageOriginalLeave');
  const canCompare = canQuery && canManageOriginals;

  const load = async () => {
    if (!canCompare) return;
    setLoading(true);
    try {
      const [slipResponse, originalResponse] = await Promise.all([
        apiFetch('/api/leave-slips'),
        apiFetch('/api/leave-slips/originals'),
      ]);
      const [slipPayload, originalPayload] = await Promise.all([slipResponse.json(), originalResponse.json()]);
      if (!slipPayload.success) throw new Error(slipPayload.error || '读取上传假条失败');
      if (!originalPayload.success) throw new Error(originalPayload.error || '读取原假条失败');
      setSlips(slipPayload.data || []);
      setStudents(slipPayload.students || []);
      setOriginals(originalPayload.data || []);
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
      {!canCompare ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><AlertCircle className="mx-auto size-6 text-amber-600" /><h2 className="mt-3 font-semibold text-amber-900">需要两项权限才能进行图片对比</h2><p className="mt-2 text-sm text-amber-800">请联系管理员同时授予“假条查看权限”和“假条对比权限”。单独拥有其中一项时，仍可在上一级使用对应的查看或维护功能。</p></div> : <>
        <div className="mb-6 flex gap-3 rounded-xl border border-slate-200 bg-white p-4"><label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="班级 / 学生 / 活动名称 / 活动 ID" /></label><Button type="button" onClick={() => void load()} disabled={loading} className="h-10 bg-slate-950 px-5 hover:bg-slate-800">{loading ? '加载中...' : '刷新'}</Button></div>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-950"><span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs text-white">1</span>已关联、可对比的假条（{pairs.length}）</h2>
        <div className="space-y-5">{pairs.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">暂无可对比记录。请先在假条查对中关联活动方原假条。</div> : pairs.map(({ slip, original }) => {
          const originalFile = originalImage(original);
          const memberRows = studentsBySlip.get(slip.id) || [];
          return <article key={slip.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3"><div><span className="text-sm font-semibold text-slate-950">{slip.activity_name || original.activity_name || '未填写活动名称'}</span><span className="ml-2 text-xs text-slate-500">关联原假条：{original.id}</span></div><Link href={`/leave-slip/originals?keyword=${encodeURIComponent(original.activity_id || original.activity_name || '')}`} className="text-sm font-medium text-sky-700 hover:text-sky-900">维护原假条</Link></div><div className="grid divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0"><section className="p-5"><p className="text-xs font-semibold text-teal-700">班级负责人上传假条</p><h2 className="mt-1 font-semibold text-slate-950">{parseJsonArray(slip.class_names).join('、') || '未填写班级'} · {slip.leave_type}</h2><p className="mt-2 text-sm text-slate-600">上传人：{slip.applicant_name || '-'}（{slip.applicant_student_id || '-'}）</p><p className="mt-1 text-sm text-slate-600">学生：{memberRows.map((student) => `${student.student_name}（${student.student_id}）`).join('、') || '未填写'}</p>{slip.leave_image_url ? <div className="mt-4"><FilePreviewLink url={slip.leave_image_url} fileName={slip.leave_image_name || '上传假条图片'} label="查看上传假条" /></div> : <p className="mt-4 text-sm text-amber-700">未上传图片</p>}</section><section className="p-5"><p className="text-xs font-semibold text-sky-700">活动方归档原假条</p><h2 className="mt-1 font-semibold text-slate-950">{original.activity_name || '未填写活动名称'}</h2><p className="mt-2 text-sm text-slate-600">活动 ID：{original.activity_id || '-'}</p><p className="mt-1 text-sm text-slate-600">班级：{parseJsonArray(original.class_names).join('、') || '未填写'}</p><p className="mt-1 text-sm text-slate-600">学生：{parseJsonArray(original.student_names).join('、') || '未填写'}</p>{originalFile ? <div className="mt-4"><FilePreviewLink url={originalFile.url} fileName={originalFile.name} label="查看原假条" /></div> : <p className="mt-4 flex items-center gap-2 text-sm text-amber-700"><FileImage className="size-4" />原假条没有可查看图片</p>}</section></div></article>;
        })}</div>
      </>}
    </div>
  </DashboardLayout>;
}
