'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, Clock, Search, X } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { FilePreviewLink } from '@/components/FilePreviewDialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Slip {
  id: string;
  slip_type: string;
  leave_type: string;
  class_names: string;
  start_time: string | null;
  end_time: string | null;
  activity_name: string | null;
  applicant_name: string | null;
  applicant_student_id: string | null;
  leave_image_url: string | null;
  leave_image_name: string | null;
  image_list: string | null;
  original_slip_id: string | null;
  duplicate_of_slip_id: string | null;
  duplicate_score: number | null;
  duplicate_warning: string | null;
  original_image_similarity: number | null;
  original_image_difference_warning: string | null;
  counselor_signature: boolean;
  official_seal: boolean;
  teacher_signature: boolean;
  is_late: boolean;
  review_status: string;
  review_note: string | null;
  created_at: string;
}
interface SlipStudent { id: string; slip_id: string; student_id: string; student_name: string; class_name: string; }
interface OriginalForReview { id: string; activity_name: string | null; class_names: string | null; student_names: string | null; image_url: string | null; image_name: string | null; image_list: string | null; }

function parseImageList(value: string | null): Array<{ url: string; name?: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === 'object' && item.url).map((item) => ({ url: String(item.url), name: item.name ? String(item.name) : undefined }));
  } catch {
    return [];
  }
  return [];
}

export default function LeaveSlipReviewPage() {
  const { user, initialized } = useUser();
  const [slips, setSlips] = useState<Slip[]>([]);
  const [students, setStudents] = useState<SlipStudent[]>([]);
  const [originalsMap, setOriginalsMap] = useState<Record<string, OriginalForReview>>({});
  const [status, setStatus] = useState('待查对');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  const canAccess = hasPermission(user, 'canReviewLeave');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await apiFetch(`/api/leave-slips/review?${params.toString()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '查询失败');
      const loadedSlips: Slip[] = data.data || [];
      setSlips(loadedSlips);
      setStudents(data.students || []);

      const originalIds = [...new Set(loadedSlips.map((slip) => slip.original_slip_id).filter((id): id is string => Boolean(id)))];
      const fetched: Record<string, OriginalForReview> = {};
      for (const originalId of originalIds) {
        try {
          const originalRes = await apiFetch(`/api/leave-slips/originals?id=${encodeURIComponent(originalId)}`);
          const originalData = await originalRes.json();
          if (originalData.success && Array.isArray(originalData.data) && originalData.data[0]) fetched[originalId] = originalData.data[0];
        } catch (fetchError) {
          console.error('加载原假条失败:', fetchError);
        }
      }
      setOriginalsMap(fetched);
    } catch (error) {
      alert(error instanceof Error ? error.message : '查询失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (initialized && user && canAccess) void load(); }, [initialized, user, canAccess, status]);

  const studentsBySlip = useMemo(() => {
    const map = new Map<string, SlipStudent[]>();
    for (const student of students) {
      const list = map.get(student.slip_id) || [];
      list.push(student);
      map.set(student.slip_id, list);
    }
    return map;
  }, [students]);

  const review = async (slip: Slip, reviewStatus: '已通过' | '已驳回') => {
    if (reviewStatus === '已驳回' && !reviewNote.trim()) { alert('驳回时必须填写查对意见'); return; }
    try {
      const res = await apiFetch('/api/leave-slips/review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slip.id, review_status: reviewStatus, review_note: reviewNote.trim() || null }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '操作失败');
      setReviewNote('');
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '操作失败');
    }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) return <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4"><div className="rounded-xl border bg-white p-6 text-center"><h2 className="font-semibold">请先登录</h2><p className="mt-2 text-sm text-slate-500">登录后才能查对假条。</p><Link href="/login?redirect=/leave-slip/review" className="mt-4 inline-block rounded-md bg-slate-950 px-4 py-2 text-sm text-white">登录/注册</Link></div></div>;
  if (!canAccess) {
    return <DashboardLayout user={user} title="假条查对" activeNavHref="/leave-slip/review"><div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><AlertCircle className="mx-auto size-6 text-amber-600" /><h2 className="mt-3 font-semibold text-amber-900">当前账号没有假条查对权限</h2><p className="mt-2 text-sm text-amber-800">请联系系统管理员授予 `canReviewLeave` 权限。</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout user={user} title="假条查对" activeNavHref="/leave-slip/review">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase text-teal-700">假条管理</p>
          <h2 className="mt-2 text-2xl font-bold text-balance text-slate-950">查对班级负责人上传的假条</h2>
          <p className="mt-2 text-sm text-pretty text-slate-600">核查时间、格式、签字、公章，并核准假条覆盖的学生名单。</p>
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">签字、公章标签是上传人提交时的人工勾选结果；绿色仅表示“已勾选”，不代表系统已识别或确认图片中存在该内容。请以假条图片为准逐项核对。</p>
        </header>

        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" placeholder="按班级、姓名、学号、活动搜索，回车查询" />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600">
            <option value="待查对">待查对</option>
            <option value="已通过">已通过</option>
            <option value="已驳回">已驳回</option>
            <option value="">全部</option>
          </select>
          <Button type="button" onClick={() => void load()} disabled={loading} className="h-10 bg-slate-950 px-5 hover:bg-slate-800">{loading ? '查询中...' : '查询'}</Button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-600">查对意见（驳回时必填）
            <input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600" placeholder="填写通过或驳回原因，留空表示无意见" />
          </label>
        </div>

        <div className="space-y-4">
          {slips.length === 0 && !loading ? <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-400">暂无符合条件的假条</div> : null}
          {slips.map((slip) => {
            const rows = studentsBySlip.get(slip.id) || [];
            const classNames = (() => { try { return JSON.parse(slip.class_names) as string[]; } catch { return [slip.class_names]; } })();
            return (
              <article key={slip.id} className={cn('rounded-xl border bg-white p-5 shadow-sm', slip.is_late ? 'border-amber-300' : 'border-slate-200')}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">{slip.slip_type}</span>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">{slip.leave_type}</span>
                      {slip.is_late && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">迟到上传</span>}
                      <span className={cn('rounded-md border px-2 py-1 text-xs font-medium', slip.review_status === '已通过' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : slip.review_status === '已驳回' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>{slip.review_status}</span>
                      {slip.duplicate_warning && <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">疑似重复图片（相似度 {slip.duplicate_score ?? '-'}%）</span>}
                    </div>
                    {slip.duplicate_warning && <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{slip.duplicate_warning}</p>}
                    {slip.original_image_difference_warning && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">图片一致性风险{slip.original_image_similarity !== null ? `（最低匹配相似度 ${slip.original_image_similarity}%）` : ''}：{slip.original_image_difference_warning}</p>}
                    <p className="mt-3 text-sm font-semibold text-slate-900">班级：{classNames.join('、')}</p>
                    <p className="mt-1 text-sm text-slate-600">上传：{slip.applicant_name || '-'}（{slip.applicant_student_id || '-'}） · {slip.start_time ? new Date(slip.start_time).toLocaleString('zh-CN') : '-'} 至 {slip.end_time ? new Date(slip.end_time).toLocaleString('zh-CN') : '-'}</p>
                    {slip.activity_name && <p className="mt-1 text-sm text-slate-600">活动：{slip.activity_name}</p>}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className={cn('rounded-md border px-2 py-1', slip.counselor_signature ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400')}>辅导员签字·{slip.counselor_signature ? '已勾选' : '未勾选'}</span>
                      <span className={cn('rounded-md border px-2 py-1', slip.official_seal ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400')}>公章·{slip.official_seal ? '已勾选' : '未勾选'}</span>
                      <span className={cn('rounded-md border px-2 py-1', slip.teacher_signature ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400')}>老师签字·{slip.teacher_signature ? '已勾选' : '未勾选'}</span>
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-medium text-slate-600">覆盖学生（{rows.length} 人）</p>
                      <div className="flex flex-wrap gap-2">
                        {rows.map((row) => <span key={row.id} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">{row.student_name}（{row.student_id}）· {row.class_name}</span>)}
                      </div>
                    </div>
                    {(parseImageList(slip.image_list).length > 0 || slip.leave_image_url) && (
                      <div className="mt-3 rounded-lg border border-slate-200 p-3">
                        <p className="mb-2 text-xs font-medium text-slate-600">上传假条截图</p>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const images = parseImageList(slip.image_list);
                            if (images.length > 0) return images.map((image, index) => <FilePreviewLink key={`${image.url}-${index}`} url={image.url} fileName={image.name} label={`上传假条图 ${index + 1}`} className="text-xs text-teal-700" />);
                            return slip.leave_image_url ? [<FilePreviewLink key="legacy" url={slip.leave_image_url} fileName={slip.leave_image_name || undefined} label="查看假条图片" className="text-xs text-teal-700" />] : null;
                          })()}
                        </div>
                        {slip.original_slip_id && originalsMap[slip.original_slip_id] && (
                          <>
                            <p className="mb-2 mt-3 text-xs font-medium text-teal-800">原假条截图（请逐张对照照片一致后通过）</p>
                            <div className="flex flex-wrap gap-2">
                              {(() => {
                                const original = originalsMap[slip.original_slip_id];
                                const images = parseImageList(original.image_list);
                                if (images.length > 0) return images.map((image, index) => <FilePreviewLink key={`original-${image.url}-${index}`} url={image.url} fileName={image.name} label={`原假条图 ${index + 1}`} className="text-xs text-sky-700" />);
                                return original.image_url ? [<FilePreviewLink key="original-legacy" url={original.image_url} fileName={original.image_name || undefined} label="查看原假条图片" className="text-xs text-sky-700" />] : null;
                              })()}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {slip.review_status === '待查对' && (
                    <div className="flex shrink-0 gap-2 lg:flex-col">
                      <Button type="button" onClick={() => void review(slip, '已通过')} className="h-10 bg-emerald-700 px-4 text-white hover:bg-emerald-800"><Check className="size-4" />通过</Button>
                      <Button type="button" onClick={() => void review(slip, '已驳回')} className="h-10 bg-rose-700 px-4 text-white hover:bg-rose-800"><X className="size-4" />驳回</Button>
                    </div>
                  )}
                </div>
                {slip.review_note && <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><Clock className="mt-0.5 size-3.5 shrink-0" />{slip.review_note}</p>}
              </article>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
