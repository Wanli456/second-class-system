'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Plus, ScanText, Upload } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { PageErrorDialog } from '@/components/PageErrorDialog';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { Button } from '@/components/ui/button';

interface ScheduleItem { date: string; weekday: string; students: string[] }
interface WorkArrangement {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  student_names: string;
  schedules: string;
  image_list: string;
  review_status: string;
  review_note: string | null;
  reviewed_by_name: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_by_name: string | null;
  created_by_user_id: string | null;
  ocr_names: string;
  created_at: string;
  updated_at: string | null;
}

const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五'] as const;

function parseNames(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
  } catch { /* ignore */ }
  return text.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
}

function parseSchedules(raw: string): ScheduleItem[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as { date?: string; weekday?: string; students?: unknown; student_names?: unknown };
        const students = parseNames(candidate.students ?? candidate.student_names ?? '');
        return students.length ? [{ date: String(candidate.date || ''), weekday: String(candidate.weekday || ''), students }] : [];
      });
    }
  } catch { /* ignore */ }
  return [];
}

function parseImageList(raw: string): Array<{ url: string; name?: string }> {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }
  return [];
}

function localDateInput(offsetDays = 0) {
  const value = new Date(Date.now() + offsetDays * 86400000);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(date: string, offsetDays: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  const shifted = new Date(parsed.getTime() + offsetDays * 86400000);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const WEEKDAY_OFFSET: Record<string, number> = { '星期一': 0, '星期二': 1, '星期三': 2, '星期四': 3, '星期五': 4, '星期六': 5, '星期日': 6 };

function parseOcrLineIntoWeekday(line: string): { weekday?: string; names: string[] } {
  const text = line.trim();
  const weekday = WEEKDAYS.find((item) => text.includes(item));
  if (!weekday) return { names: [] };
  const after = text.slice(text.indexOf(weekday) + weekday.length);
  const names = after.split(/[,，、\s]+/).map((name) => name.trim()).filter((name) => /^[\u4e00-\u9fff]{2,4}$/.test(name));
  return { weekday, names };
}

export default function AttendanceWorkPage() {
  const { user, initialized } = useUser();
  const [name, setName] = useState('本周考勤工作安排');
  const [weekStartDate, setWeekStartDate] = useState(() => localDateInput());
  const [weeklyNames, setWeeklyNames] = useState<Record<string, string>>({ 星期一: '', 星期二: '', 星期三: '', 星期四: '', 星期五: '' });
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrLines, setOcrLines] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<WorkArrangement[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const canUpload = Boolean(user && (user.role === 'admin' || hasPermission(user, 'canManageAttendanceWork')));
  const canReview = Boolean(user && (user.role === 'admin' || hasPermission(user, 'canReviewLeave')));

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await apiFetch('/api/attendance-work');
      const data = await res.json();
      if (data.success) setItems(data.data || []);
    } catch {
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (canUpload || canReview) void loadList();
  }, [user, canUpload, canReview, loadList]);

  const updateWeeklyNames = (weekday: string, value: string) => {
    setWeeklyNames((previous) => ({ ...previous, [weekday]: value }));
  };

  const startEdit = (item: WorkArrangement) => {
    setEditingId(item.id);
    setName(item.name);
    setWeekStartDate(item.start_date || '');
    setImageFiles([]);
    setPreviews([]);
    setOcrLines([]);
    setError(null);
    setSuccess(null);
    const next: Record<string, string> = { 星期一: '', 星期二: '', 星期三: '', 星期四: '', 星期五: '' };
    const schedules = parseSchedules(item.schedules);
    for (const schedule of schedules) {
      if (WEEKDAYS.includes(schedule.weekday as (typeof WEEKDAYS)[number])) {
        next[schedule.weekday] = schedule.students.join('\n');
      }
    }
    if (!schedules.length) {
      for (const weekday of WEEKDAYS) next[weekday] = parseNames(item.student_names).join('\n');
    }
    setWeeklyNames(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('本周考勤工作安排');
    setWeekStartDate(() => localDateInput());
    setWeeklyNames({ 星期一: '', 星期二: '', 星期三: '', 星期四: '', 星期五: '' });
    setImageFiles([]);
    setPreviews([]);
    setOcrLines([]);
    setError(null);
    setSuccess(null);
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      setError('单张考勤表图片不能超过 5MB');
      return;
    }
    setImageFiles((previous) => [...previous, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPreviews((previous) => [...previous, String(reader.result)]);
      reader.readAsDataURL(file);
    });
  };

  const runOcr = async () => {
    if (!imageFiles.length) { setError('请先上传考勤表图片'); return; }
    setError(null);
    setOcrLoading(true);
    setOcrLines([]);
    try {
      const uploaded: Array<{ url: string; name: string }> = [];
      for (const file of imageFiles) {
        const body = new FormData();
        body.append('file', file);
        const uploadRes = await apiFetch('/api/upload', { method: 'POST', body });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) throw new Error(uploadData.error || '图片上传失败');
        uploaded.push({ url: String(uploadData.url), name: String(uploadData.file_name || file.name) });
      }
      const res = await apiFetch('/api/ocr/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: uploaded.map((item) => item.url) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '识别失败');

      const lines: string[] = Array.isArray(data.data.lines) ? data.data.lines.map((line: { text?: string }) => String(line.text || '')) : [];
      setOcrLines(lines);

      const pending = { ...weeklyNames };
      for (const line of lines) {
        const parsed = parseOcrLineIntoWeekday(line);
        if (!parsed.weekday || !parsed.names.length) continue;
        const existing = new Set(pending[parsed.weekday].split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean));
        const added = parsed.names.filter((item) => !existing.has(item));
        pending[parsed.weekday] = [...pending[parsed.weekday].split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean), ...added].join('\n');
      }
      setWeeklyNames(pending);
      if (!lines.some((line) => WEEKDAYS.some((weekday) => line.includes(weekday)))) {
        setError('图片里没有识别到“星期一/星期二...”等字样，请按下方每天文本框手动填写');
      }
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : '识别失败，可以手动填写姓名');
    } finally {
      setOcrLoading(false);
    }
  };

  const submit = async () => {
    setError(null);
    setSuccess(null);
    const schedules = WEEKDAYS.flatMap((weekday) => {
      const students = weeklyNames[weekday].split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
      if (!students.length) return [];
      const date = shiftDate(weekStartDate, WEEKDAY_OFFSET[weekday]);
      return date ? [{ weekday, students, date }] : [];
    });
    if (!weekStartDate) { setError('请选择这张考勤表的周一日期（周起始日期）'); return; }
    if (!schedules.length) { setError('请至少为某一天填写考勤人员姓名'); return; }
    if (!editingId && !imageFiles.length) { setError('请上传考勤工作安排表截图'); return; }

    setSubmitting(true);
    try {
      // 修改模式：如果传了新图片就重新上传更新，否则沿用原图片。
      let images: Array<{ url: string; name: string }> = [];
      if (imageFiles.length || !editingId) {
        images = [];
        for (const file of imageFiles) {
          const body = new FormData();
          body.append('file', file);
          const uploadRes = await apiFetch('/api/upload', { method: 'POST', body });
          const uploadData = await uploadRes.json();
          if (!uploadData.success) throw new Error(uploadData.error || '图片上传失败');
          images.push({ url: String(uploadData.url), name: String(uploadData.file_name || file.name) });
        }
      }
      const payload: Record<string, unknown> = {
        name: name.trim() || '考勤工作安排',
        week_start_date: weekStartDate,
        schedules,
      };
      if (editingId) {
        payload.id = editingId;
        if (images.length) payload.images = images;
      } else {
        payload.images = images;
      }
      const res = await apiFetch('/api/attendance-work', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || (editingId ? '修改失败' : '提交失败'));
      setSuccess(editingId ? '已保存修改，状态回到待查对，需要重新查对通过后生效' : '已提交，等待查对通过后，名单内人员将在对应日期不算晚自习缺勤');
      setImageFiles([]);
      setPreviews([]);
      setOcrLines([]);
      setEditingId(null);
      setName('本周考勤工作安排');
      setWeekStartDate(() => localDateInput());
      setWeeklyNames({ 星期一: '', 星期二: '', 星期三: '', 星期四: '', 星期五: '' });
      void loadList();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : (editingId ? '修改失败' : '提交失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (id: string, status: '已通过' | '已驳回') => {
    setError(null);
    try {
      const res = await apiFetch('/api/attendance-work', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, review_status: status, review_note: status === '已通过' ? '考勤工作安排' : '查对不通过' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '查对失败');
      await loadList();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : '查对失败');
    }
  };

  if (!initialized) return <AuthLoadingScreen />;
  if (!user) {
    return (
      <DashboardLayout user={user} title="部门考勤工作安排" activeNavHref="/attendance-work">
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">请先登录。</div>
      </DashboardLayout>
    );
  }
  if (!canUpload && !canReview) {
    return (
      <DashboardLayout user={user} title="部门考勤工作安排" activeNavHref="/attendance-work">
        <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertCircle className="mx-auto size-6 text-amber-600" />
          <h2 className="mt-3 font-semibold text-amber-900">当前账号没有部门考勤工作安排权限</h2>
          <p className="mt-2 text-sm text-amber-800">请联系系统管理员授予 `canManageAttendanceWork`（提交）或 `canReviewLeave`（查对）权限。</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user} title="部门考勤工作安排" activeNavHref="/attendance-work">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase text-teal-700">部门工作安排</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">考勤人员免晚自习安排</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">按周上传部门考勤排班表：先选“周一日期”，再按星期填写每天考勤人员。查对通过后，名单内人员在对应日期不再记为晚自习缺勤。</p>
        </header>

        {success && <div role="status" className="sr-only">{success}</div>}

        {canUpload && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-950">{editingId ? '修改考勤工作安排' : '新增考勤工作安排'}</h3>
              {editingId && <Button type="button" variant="ghost" onClick={cancelEdit} className="text-slate-500">取消修改</Button>}
            </div>
            {editingId && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">正在修改已提交的安排。如果不上传新图片，会保留原考勤表截图；保存后状态回到“待查对”，需要重新查对。</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700">安排名称
                <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="例如：第 5 周考勤排班表" />
              </label>
              <label className="block text-xs font-semibold text-slate-700">这张表的“星期一”是几号
                <input type="date" value={weekStartDate} onChange={(event) => setWeekStartDate(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-medium text-slate-600">按星期填写每天考勤人员（每行一个，可用顿号/逗号分隔）：</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {WEEKDAYS.map((weekday, index) => (
                  <label key={weekday} className="block text-xs font-semibold text-slate-700">
                    {weekday}（{shiftDate(weekStartDate, WEEKDAY_OFFSET[weekday]) || '日期待选'}）
                    <textarea value={weeklyNames[weekday]} onChange={(event) => updateWeeklyNames(weekday, event.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder={`${weekday}考勤人员`} />
                  </label>
                ))}
              </div>
            </div>

            <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition-colors hover:border-teal-400 hover:bg-teal-50/40">
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-slate-200"><Upload className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{imageFiles.length ? `已选 ${imageFiles.length} 张图片` : '选择考勤排班表图片（可多张截图）'}</span><span className="mt-0.5 block text-xs text-slate-500">支持常见图片格式，单张不超过 5MB</span></span>
                <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">选择文件</span>
                <input type="file" accept="image/*" multiple className="sr-only" onChange={handleImageChange} aria-label="考勤排班表图片，可多选" />
              </span>
            </label>
            {previews.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{previews.map((preview, index) => <img key={`${preview.slice(0, 32)}-${index}`} src={preview} alt={`预览 ${index + 1}`} className="size-24 rounded-md border border-slate-200 object-contain" />)}</div>}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => void runOcr()} disabled={ocrLoading || !imageFiles.length} className="bg-white disabled:opacity-50"><ScanText className="size-4" />{ocrLoading ? '识别中...' : '自动识别“星期+姓名”（可手动改）'}</Button>
              <Button type="button" onClick={() => void submit()} disabled={submitting} className="bg-slate-950 hover:bg-slate-800"><Plus className="size-4" />{submitting ? '提交中...' : (editingId ? '保存修改' : '提交安排')}</Button>
            </div>
            {ocrLines.length > 0 && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-medium text-slate-600">识别到的人员/内容</p>
                <div className="max-h-32 space-y-1 overflow-auto">{ocrLines.map((line, index) => <p key={`${line}-${index}`} className="text-xs leading-5 text-slate-700">{line}</p>)}</div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-950">已提交的安排</h3>
          {listLoading ? <p className="mt-4 text-sm text-slate-400">加载中...</p> : items.length === 0 ? <p className="mt-4 text-sm text-slate-400">暂无安排。</p> : (
            <div className="mt-4 space-y-3">
              {items.map((item) => {
                const schedules = parseSchedules(item.schedules);
                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-950">{item.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.review_status === '已通过' ? 'bg-emerald-100 text-emerald-800' : item.review_status === '已驳回' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>{item.review_status}</span>
                      <span className="ml-auto text-xs text-slate-500">{item.created_by_name || '-'} 提交</span>
                    </div>
                    {schedules.length ? (
                      <div className="mt-2 space-y-1 text-sm text-slate-600">
                        {schedules.map((schedule) => <p key={`${item.id}-${schedule.weekday}`}>{schedule.weekday}（{schedule.date}）：{schedule.students.join('、')}</p>)}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">日期：{item.start_date || '-'} 至 {item.end_date || '-'} · 考勤人员：{parseNames(item.student_names).join('、') || '-'}</p>
                    )}
                    {parseImageList(item.image_list).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {parseImageList(item.image_list).map((image, index) => <img key={`${image.url.slice(0, 40)}-${index}`} src={image.url} alt={`考勤表 ${index + 1}`} className="size-20 rounded-md border border-slate-200 object-contain" />)}
                      </div>
                    )}
                    {item.review_note && <p className="mt-2 text-xs text-slate-500">备注：{item.review_note}</p>}
                    {canUpload && (user.role === 'admin' || user.role === 'leader' || item.created_by_user_id === user.id) && (
                      <Button type="button" variant="outline" onClick={() => startEdit(item)} className="mt-3 bg-white">修改（临时换人、改日期）</Button>
                    )}
                    {canReview && item.review_status === '待查对' && (
                      <div className="mt-3 flex gap-2">
                        <Button type="button" onClick={() => void review(item.id, '已通过')} className="bg-emerald-700 text-white hover:bg-emerald-800">通过</Button>
                        <Button type="button" onClick={() => void review(item.id, '已驳回')} className="bg-rose-600 text-white hover:bg-rose-700">驳回</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <PageErrorDialog open={Boolean(error)} message={error} onClose={() => setError(null)} />
      <PageErrorDialog open={Boolean(success)} message={success} tone={success?.includes('驳回') || success?.includes('失败') ? 'warning' : 'success'} onClose={() => setSuccess(null)} />
    </DashboardLayout>
  );
}