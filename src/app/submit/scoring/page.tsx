'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { Upload, Search, CheckCircle2, AlertCircle, LogIn, Download, Award, FileCheck, ChevronLeft } from 'lucide-react';
import { apiFetch } from '@/lib/client-api';
import { useUser } from '@/contexts/UserContext';
import { hasPermission } from '@/lib/department-permissions';
import { formatActivityScopes } from '@/lib/business-rules';
import { FilePreviewLink } from '@/components/FilePreviewDialog';
import { ImageUploadPreviews } from '@/components/ImageUploadPreviews';
import { CategoryBadge } from '@/components/CategoryBadge';
import { ClassScoringImport } from '@/components/ClassScoringImport';
import { extractScoringRows, validateScoringRows, type ScoringImportIssue } from '@/lib/scoring-import';
import { formatBusinessDateTime } from '@/lib/datetime';

interface Activity {
  id: string;
  full_name: string;
  level: string;
  category: string;
  category_primary?: string | null;
  category_secondary?: string | null;
  leader_name: string;
  leader_phone: string;
  scoring_status: string;
  scoring_table_url: string | null;
  scoring_table_file_name: string | null;
  record_file_url: string | null;
  record_file_name: string | null;
  record_photo_url: string | null;
  record_photo_file_name: string | null;
  scope_names?: string | null;
  scope_type?: 'department' | 'class' | null;
  scope_name?: string | null;
  start_time?: string;
  end_time?: string;
  registration_start_time?: string | null;
  registration_end_time?: string | null;
  activity_submitter_name?: string | null;
  activity_submitter_student_id?: string | null;
  scoring_material_submitter_name?: string | null;
  scoring_material_submitter_student_id?: string | null;
}

export default function SubmitScoringPage() {
  const { user, initialized } = useUser();
  const [activityName, setActivityName] = useState('');
  const [searched, setSearched] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [scoringFile, setScoringFile] = useState<File | null>(null);
  const [scoringIssues, setScoringIssues] = useState<ScoringImportIssue[]>([]);
  const [scoringFormatError, setScoringFormatError] = useState('');
  const [recordPhotoFile, setRecordPhotoFile] = useState<File | null>(null);
  const [recordPhotoPreview, setRecordPhotoPreview] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [targetActivityId, setTargetActivityId] = useState<string | null>(null);
  const [submittedActivityId, setSubmittedActivityId] = useState<string | null>(null);
  const [showResubmit, setShowResubmit] = useState(false);
  const [scoringView, setScoringView] = useState<'activity' | 'class' | null>(null);
  const canAccessScoringMaterials = hasPermission(user, 'canSubmitScoring');

  useEffect(() => {
    if (!recordPhotoFile) { setRecordPhotoPreview(null); return; }
    const url = URL.createObjectURL(recordPhotoFile);
    setRecordPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [recordPhotoFile]);

  useEffect(() => {
    if (!initialized || !user || !canAccessScoringMaterials) return;
    const activityId = new URLSearchParams(window.location.search).get('activityId');
    if (!activityId) return;
    setTargetActivityId(activityId);
    setSearched(true);
    setLoading(true);
    apiFetch(`/api/activities?purpose=scoring&id=${encodeURIComponent(activityId)}`)
      .then(res => res.json())
      .then((data: { success?: boolean; data?: Activity[]; error?: string }) => {
        if (!data.success) throw new Error(data.error || '查询活动失败');
        setActivities(data.data || []);
        setSelectedActivityId(data.data?.[0]?.id || activityId);
      })
      .catch(error => alert(error instanceof Error ? error.message : '查询活动失败'))
      .finally(() => setLoading(false));
  }, [canAccessScoringMaterials, initialized, user]);

  useEffect(() => {
    if (!targetActivityId || loading || !activities.length) return;
    document.getElementById(`scoring-activity-${targetActivityId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activities, loading, targetActivityId]);

  const handleSearch = async () => {
    if (!activityName) {
      alert('请输入活动名称');
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await apiFetch(`/api/activities?purpose=scoring&keyword=${encodeURIComponent(activityName)}`);
      const data = await res.json();
      if (data.success) {
        setActivities(data.data);
      } else {
        alert(data.error || '查询失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file: File): Promise<{ url: string; fileName: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', 'app-files');
    formData.append('purpose', 'scoring');
    const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '上传失败');
    return { url: String(data.url), fileName: String(data.file_name || file.name) };
  };

  const handleSubmitScoring = async () => {
    if (!selectedActivityId) {
      alert('请选择要提交赋分材料的活动');
      return;
    }
    if (!scoringFile) {
      alert('请上传活动赋分表');
      return;
    }
    if (scoringFormatError || scoringIssues.length) {
      alert(scoringFormatError || `赋分表格式不正确，发现 ${scoringIssues.length} 处问题`);
      return;
    }

    const activity = activities.find(a => a.id === selectedActivityId);
    if (!activity) return;

    // 检查是否已赋分
    if (activity.scoring_status === '已赋分') {
      alert('该活动已赋分，不可重复提交');
      return;
    }

    // 校级活动需要备案表
    if (activity.level === '校级' && !recordPhotoFile && !activity.record_photo_url) {
      alert('校级活动需要上传备案表照片');
      return;
    }

    setUploadingId(selectedActivityId);
    try {
      const scoringUpload = await uploadFile(scoringFile);
      const scoring_table_url = scoringUpload.url;
      let record_photo_url = activity.record_photo_url;
      let record_photo_file_name = activity.record_photo_file_name;
      if (recordPhotoFile) {
        const recordUpload = await uploadFile(recordPhotoFile);
        record_photo_url = recordUpload.url;
        record_photo_file_name = recordUpload.fileName;
      }

      const res = await apiFetch('/api/activities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedActivityId,
          scoring_table_url,
          scoring_table_file_name: scoringUpload.fileName,
          record_photo_url,
          record_photo_file_name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('赋分材料提交成功！');
        setSubmittedActivityId(selectedActivityId);
        setScoringFile(null);
        setRecordPhotoFile(null);
        setSelectedActivityId('');
        setShowResubmit(false);
        // Refresh activities
        handleSearch();
      } else {
        alert(data.error || '提交失败');
      }
    } finally {
      setUploadingId(null);
    }
  };

  const checkScoringFile = async (file: File | null) => {
    setScoringFile(file); setScoringIssues([]); setScoringFormatError('');
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
      const validation = validateScoringRows(extractScoringRows(matrix));
      setScoringIssues(validation.issues);
    } catch {
      setScoringFormatError('赋分表解析失败，请使用系统模板填写 .xlsx 文件');
    }
  };

  const downloadScoringIssues = () => {
    const text = scoringIssues.map((issue, index) => `${index + 1}. 第 ${issue.rowNumber} 行 ${issue.column}：${issue.message}`).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${scoringFile?.name || '活动赋分表'}-错误信息.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectedActivity = activities.find(a => a.id === selectedActivityId);

  // 登录检查 - 等待用户状态初始化完成后再判断
  if (!initialized) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100">
            <LogIn className="h-6 w-6 text-teal-600" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">需要登录</h2>
          <p className="mb-6 text-sm text-gray-500">活动负责人需要登录后才能提交赋分材料</p>
          <Link
            href="/login?redirect=/submit/scoring"
            className="inline-flex w-full items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            登录/注册
          </Link>
          <Link href="/" className="mt-3 block text-sm text-gray-500 hover:text-teal-600">返回首页</Link>
        </div>
      </div>
    );
  }

  const canSubmitMaterials = hasPermission(user, 'canSubmitScoring');
  const canImportScoring = hasPermission(user, 'canImportScoring');

  // 只有班级赋分表提交权限的用户：只显示导入窗口
  if (!canSubmitMaterials && canImportScoring) {
    return (
      <DashboardLayout title="提交班级赋分表" user={user}>
        <ClassScoringImport mode="submit" />
      </DashboardLayout>
    );
  }

  if (!canSubmitMaterials) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">暂无赋分材料权限</h2>
          <p className="mb-6 text-sm text-gray-500">请联系管理员开通赋分材料权限。</p>
          <Link href="/" className="inline-flex w-full items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const showOverview = canSubmitMaterials && canImportScoring && scoringView === null;
  const showActivity = canSubmitMaterials && (scoringView === 'activity' || !canImportScoring);
  const showClass = canImportScoring && (scoringView === 'class' || !canSubmitMaterials);

  return (
    <DashboardLayout title="赋分材料提交" user={user}>
      <div className="space-y-6">
        {showOverview ? (
          <section className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-sm font-medium text-teal-700">材料提交</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">赋分材料提交</h2>
              <p className="mt-2 text-sm text-slate-500">选择一个板块进入。</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <button type="button" onClick={() => setScoringView('activity')} className="group flex min-h-64 w-full flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500">
                <span className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Award className="size-5" /></span>
                <span className="mt-5 text-base font-semibold text-slate-950">提交活动赋分材料</span>
                <span className="mt-1.5 flex-1 text-sm leading-6 text-slate-500">查询已审核通过的活动，上传活动赋分表及校级备案表照片。</span>
                <span className="mt-4 inline-flex w-fit items-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition group-hover:bg-slate-800">进入活动赋分材料</span>
              </button>
              <button type="button" onClick={() => setScoringView('class')} className="group flex min-h-64 w-full flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500">
                <span className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><FileCheck className="size-5" /></span>
                <span className="mt-5 text-base font-semibold text-slate-950">提交班级赋分表</span>
                <span className="mt-1.5 flex-1 text-sm leading-6 text-slate-500">上传班级赋分表，自动审核后进入人工确认流程。</span>
                <span className="mt-4 inline-flex w-fit items-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition group-hover:bg-slate-800">进入班级赋分表</span>
              </button>
            </div>
          </section>
        ) : (
          <>
            {canSubmitMaterials && canImportScoring && (
              <button type="button" onClick={() => setScoringView(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50">
                <ChevronLeft className="size-4" />返回赋分材料入口
              </button>
            )}
            {showActivity && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="text-base font-semibold text-slate-950">提交活动赋分材料</h2>
            <p className="mt-1.5 text-sm text-slate-500">输入活动名称关键字，查询已审核通过的活动，提交活动赋分表及备案表照片。</p>
          </div>
          <div className="mt-5 flex gap-3">
            <input
              type="text"
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              placeholder="输入活动名称关键字"
              className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
          {searched && activities.length === 0 && !loading && (
            <div className="mt-5 rounded-lg border border-gray-200 bg-white p-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">暂无已审核通过的活动</p>
            <p className="mt-1 text-xs text-gray-400">请先提交活动信息并等待审核通过</p>
            </div>
          )}

          {activities.length > 0 && (
            <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="mb-4 text-base font-semibold text-gray-900">活动赋分材料</h3>
              
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">选择活动 *</label>
                <select
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                >
                  <option value="">请选择活动</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.scoring_status === '已赋分'}>
                      {a.id} - {a.full_name} ({a.level})
                      {a.scoring_status === '已赋分' ? ' [已赋分，不可提交]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedActivity && (
                <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="grid gap-2 text-sm">
                     <div className="flex justify-between gap-4">
                       <span className="shrink-0 text-gray-500">分类</span>
                       <CategoryBadge category={selectedActivity.category} primary={selectedActivity.category_primary} secondary={selectedActivity.category_secondary} />
                     </div>
                     <div className="flex justify-between gap-4">
                       <span className="shrink-0 text-gray-500">活动时间</span>
                       <span className="text-right font-medium">{selectedActivity.start_time && selectedActivity.end_time ? `${formatBusinessDateTime(selectedActivity.start_time)} 至 ${formatBusinessDateTime(selectedActivity.end_time)}` : '未填写'}</span>
                     </div>
                     <div className="flex justify-between gap-4">
                       <span className="shrink-0 text-gray-500">活动报名时间</span>
                       <span className="text-right font-medium">{selectedActivity.registration_start_time && selectedActivity.registration_end_time ? `${formatBusinessDateTime(selectedActivity.registration_start_time)} 至 ${formatBusinessDateTime(selectedActivity.registration_end_time)}` : '未填写（历史记录）'}</span>
                     </div>
                     <div className="flex justify-between">
                      <span className="text-gray-500">活动级别</span>
                      <span className="font-medium">{selectedActivity.level}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="shrink-0 text-gray-500">单位</span>
                      <span className="text-right font-medium">{formatActivityScopes(selectedActivity)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">赋分状态</span>
                      <span className={`font-medium ${selectedActivity.scoring_status === '已赋分' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {selectedActivity.scoring_status}
                      </span>
                    </div>
                    {selectedActivity.record_file_url && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-gray-500">备案表文档</span>
                        <div className="flex items-center gap-2">
                          <FilePreviewLink url={selectedActivity.record_file_url} fileName={selectedActivity.record_file_name} label="预览已上传备案表" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-teal-700 hover:border-teal-300 hover:bg-teal-50" />
                          <a href={selectedActivity.record_file_url} download={selectedActivity.record_file_name || undefined} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"><Download className="size-3" aria-hidden="true" />下载</a>
                        </div>
                      </div>
                    )}
                    {selectedActivity.scoring_table_url && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-gray-500">活动赋分表</span>
                        <div className="flex items-center gap-2">
                          <FilePreviewLink url={selectedActivity.scoring_table_url} fileName={selectedActivity.scoring_table_file_name} label="预览已上传赋分表" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-teal-700 hover:border-teal-300 hover:bg-teal-50" />
                          <a href={selectedActivity.scoring_table_url} download={selectedActivity.scoring_table_file_name || undefined} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"><Download className="size-3" aria-hidden="true" />下载</a>
                        </div>
                      </div>
                    )}
                    {selectedActivity.level === '校级' && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-gray-500">备案表照片</span>
                        {selectedActivity.record_photo_url ? <div className="flex items-center gap-2"><FilePreviewLink url={selectedActivity.record_photo_url} fileName={selectedActivity.record_photo_file_name} label="预览已上传备案表照片" className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-teal-700 hover:border-teal-300 hover:bg-teal-50" /><a href={selectedActivity.record_photo_url} download={selectedActivity.record_photo_file_name || undefined} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"><Download className="size-3" aria-hidden="true" />下载</a></div> : <span className="font-medium text-amber-600">待上传（必需）</span>}
                      </div>
                    )}
                  </div>
                  {selectedActivity.level === '校级' && !selectedActivity.record_photo_url && (
                    <p className="mt-2 text-xs text-amber-600">
                      * 校级活动需要上传备案表照片
                    </p>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  活动赋分表 *（Excel 格式）
                </label>
                <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
                  <Upload className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <input
                    type="file"
                    id="scoring-file"
                    accept=".xlsx,.xls"
                    onChange={(e) => void checkScoringFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <label
                    htmlFor="scoring-file"
                    className="cursor-pointer text-sm text-teal-600 hover:underline"
                  >
                    点击上传赋分表
                  </label>
                  <p className="mt-1 text-xs text-gray-400">仅支持 Excel 格式（.xlsx, .xls）</p>
                  {scoringFile && (
                    <p className="mt-2 text-xs text-emerald-600">已选择：{scoringFile.name}</p>
                  )}
                  {scoringFormatError && <p className="mt-2 text-left text-xs text-rose-600">{scoringFormatError}</p>}
                  {scoringIssues.length > 0 && <>
                    {scoringIssues.length <= 20 ? <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-left text-xs text-rose-600">{scoringIssues.map((issue, index) => <li key={`${issue.rowNumber}-${issue.column}-${index}`}>第 {issue.rowNumber} 行 {issue.column}：{issue.message}</li>)}</ul> : <div className="mt-2 text-left text-xs text-rose-700"><p>错误信息超过 20 条，请下载 TXT 文件查看全部错误。</p><button type="button" onClick={downloadScoringIssues} className="mt-1 font-medium underline underline-offset-2 hover:text-rose-900">下载全部 {scoringIssues.length} 条错误信息（TXT）</button></div>}
                  </>}
                </div>
              </div>

              {selectedActivity?.level === '校级' && (
                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    活动备案表照片 *（校级活动必交）
                  </label>
                  <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
                    <Upload className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    <input
                      type="file"
                      id="record-photo-file"
                      accept=".jpg,.jpeg,.png"
                      onChange={(e) => setRecordPhotoFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label
                      htmlFor="record-photo-file"
                      className="cursor-pointer text-sm text-teal-600 hover:underline"
                    >
                      点击上传备案表照片
                    </label>
                    <p className="mt-1 text-xs text-gray-400">支持 JPG、PNG 格式{selectedActivity.record_photo_url ? '；重新选择可替换原照片' : ''}</p>
                    {selectedActivity.record_photo_url && !recordPhotoFile && <p className="mt-2 text-xs text-emerald-600">当前已有备案表照片，若无需替换可直接提交</p>}
                    {recordPhotoFile && (
                      <>
                        <p className="mt-2 text-xs text-emerald-600">已选择：{recordPhotoFile.name}</p>
                        {recordPhotoPreview && <ImageUploadPreviews imageUrls={[recordPhotoPreview]} altPrefix="备案表照片" onRemove={() => setRecordPhotoFile(null)} />}
                      </>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleSubmitScoring}
                disabled={uploadingId !== null || !selectedActivityId || !scoringFile || selectedActivity?.scoring_status === '已赋分'}
                className="w-full rounded-md bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {uploadingId ? '提交中...' : '提交赋分材料'}
              </button>

              {/* 重新提交按钮 */}
              {submittedActivityId && !showResubmit && activities.find((activity) => activity.id === submittedActivityId)?.scoring_status !== '已赋分' && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">赋分材料已提交</span>
                  </div>
                  <p className="mt-2 text-xs text-emerald-600">
                    如发现提交材料有误，可点击下方按钮重新提交
                  </p>
                  <button
                    onClick={() => {
                      setShowResubmit(true);
                      setSelectedActivityId(submittedActivityId);
                    }}
                    className="mt-3 w-full rounded-md border border-emerald-300 bg-white py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    重新提交
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="mb-4 text-base font-semibold text-gray-900">我的活动列表</h3>
              <div className="space-y-3">
                {activities.map((a) => (
                  <div id={`scoring-activity-${a.id}`} key={a.id} className={`rounded-lg border border-gray-100 p-3 ${a.id === selectedActivityId ? 'border-teal-500 ring-2 ring-teal-100' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{a.full_name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {a.id} | <CategoryBadge category={a.category} primary={a.category_primary} secondary={a.category_secondary} /> | {a.level}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">{formatActivityScopes(a)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          a.scoring_status === '已赋分' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {a.scoring_status}
                        </span>
                        {a.scoring_table_url && <span className="text-xs text-emerald-600">已提交材料</span>}
                      </div>
                    </div>
                    {a.scoring_table_url && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <FilePreviewLink url={a.scoring_table_url} fileName={a.scoring_table_file_name} label="预览赋分表" className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-teal-700 hover:border-teal-300 hover:bg-teal-50" />
                        <a href={a.scoring_table_url} download={a.scoring_table_file_name || undefined} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"><Download className="size-3" aria-hidden="true" />下载</a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            </div>
          )}
        </section>
            )}
            {showClass && <ClassScoringImport mode="submit" />}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
