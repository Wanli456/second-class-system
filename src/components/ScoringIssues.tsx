'use client';

import type { ScoringImportIssue } from '@/lib/scoring-import';

export function ScoringIssues({ issues }: { issues: ScoringImportIssue[] }) {
  if (!issues.length) return null;
  const download = () => {
    const text = issues.map(issue => `第 ${issue.rowNumber} 行 ${issue.column}：${issue.message}`).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '赋分表全部错误信息.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return issues.length <= 20 ? (
    <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto break-words text-left text-xs text-rose-700">
      {issues.map((issue, index) => <li key={index}>第 {issue.rowNumber} 行 {issue.column}：{issue.message}</li>)}
    </ul>
  ) : (
    <div className="mt-2 text-left text-xs text-rose-700">
      <p>错误信息超过 20 条，请下载 TXT 文件查看全部错误。</p>
      <button type="button" onClick={download} className="mt-1 font-medium underline underline-offset-2 hover:text-rose-900">下载全部 {issues.length} 条错误信息（TXT）</button>
    </div>
  );
}
