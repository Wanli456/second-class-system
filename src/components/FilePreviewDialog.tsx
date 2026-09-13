'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { previewKind, type PreviewKind } from '@/lib/file-preview';
import { apiFetch } from '@/lib/client-api';
import { formatBusinessDateTime } from '@/lib/datetime';

type ExcelSheet = {
  name: string;
  rows: string[][];
};

type DocumentPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'word-ready'; html: string }
  | { status: 'excel-ready'; sheets: ExcelSheet[] }
  | { status: 'error'; message: string };

const IDLE_DOCUMENT_STATE: DocumentPreviewState = { status: 'idle' };
type ReadyDocumentPreviewState = Extract<DocumentPreviewState, { status: 'word-ready' | 'excel-ready' }>;
const DOCUMENT_PREVIEW_CACHE = new Map<string, Promise<ReadyDocumentPreviewState>>();
const MAX_DOCUMENT_PREVIEWS = 8;

function formatCellValue(value: unknown): string {
  if (value instanceof Date) return formatBusinessDateTime(value);
  if (value === null || value === undefined) return '';
  return String(value);
}

async function parseExcelWorkbook(buffer: ArrayBuffer): Promise<ExcelSheet[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const columnCount = rows.reduce((count, row) => Math.max(count, row.length), 0);

    return {
      name,
      rows: rows.map((row) => Array.from({ length: columnCount }, (_, index) => formatCellValue(row[index]))),
    };
  });
}

function isSafeResourceUrl(value: string, allowDataImage: boolean) {
  const normalized = value.trim().toLowerCase();
  const isRasterDataImage = /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);/.test(normalized);
  return (
    normalized.startsWith('#') ||
    normalized.startsWith('/') ||
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('mailto:') ||
    (allowDataImage && isRasterDataImage)
  );
}

function sanitizeWordHtml(html: string): string {
  if (typeof document === 'undefined') return html;

  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('script, iframe, object, embed, form, link, meta').forEach((element) => element.remove());
  container.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
      } else if (name === 'href' && !isSafeResourceUrl(attribute.value, false)) {
        element.removeAttribute(attribute.name);
      } else if (name === 'src' && !isSafeResourceUrl(attribute.value, true)) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return container.innerHTML;
}

async function fetchPreviewBuffer(url: string): Promise<ArrayBuffer> {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error(`文件读取失败（HTTP ${response.status}）`);
  return response.arrayBuffer();
}

type MammothElement = {
  type?: string;
  children?: MammothElement[];
  alignment?: string | null;
  indent?: { firstLine?: string | number | null } | null;
  styleId?: string | null;
  styleName?: string | null;
};

function wordParagraphStyleName(element: MammothElement): string | null {
  const directAlignment = element.alignment === 'center'
    ? 'center'
    : element.alignment === 'right'
      ? 'right'
      : element.alignment === 'justify'
        ? 'justify'
        : null;
  const styleId = (element.styleId || '').toLowerCase();
  const styleName = (element.styleName || '').toLowerCase();
  const isTitleStyle = styleId === 'title' || styleName === 'title' || styleName === '标题';
  const alignment = directAlignment || (isTitleStyle ? 'center' : null);
  const hasFirstLineIndent = Boolean(element.indent && element.indent.firstLine);
  if (!alignment && !hasFirstLineIndent) return null;
  if (alignment && hasFirstLineIndent) return `wp-${alignment}-indent`;
  if (alignment) return `wp-${alignment}`;
  return 'wp-indent';
}

function transformWordAlignment(element: MammothElement): MammothElement {
  const children = element.children ? element.children.map(transformWordAlignment) : element.children;
  const next = children === element.children ? element : { ...element, children };
  if (next.type === 'paragraph') {
    const className = wordParagraphStyleName(next);
    if (className) {
      return { ...next, styleId: className, styleName: className };
    }
  }
  return next;
}

async function parseWordDocument(buffer: ArrayBuffer): Promise<string> {
  const mammothModule = (await import('mammoth')) as unknown as {
    convertToHtml?: (input: { arrayBuffer: ArrayBuffer }, options?: { styleMap?: string[]; transformDocument?: (element: MammothElement) => MammothElement }) => Promise<{ value: string }>;
    default?: { convertToHtml: (input: { arrayBuffer: ArrayBuffer }, options?: { styleMap?: string[]; transformDocument?: (element: MammothElement) => MammothElement }) => Promise<{ value: string }> };
  };
  const mammoth = mammothModule.default || mammothModule;
  if (!mammoth.convertToHtml) throw new Error('Word 预览组件加载失败');

  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      styleMap: [
        "p[style-name='wp-center'] => p.align-center:fresh",
        "p[style-name='wp-right'] => p.align-right:fresh",
        "p[style-name='wp-justify'] => p.align-justify:fresh",
        "p[style-name='wp-indent'] => p.indent-first-line:fresh",
        "p[style-name='wp-center-indent'] => p.align-center.indent-first-line:fresh",
        "p[style-name='wp-right-indent'] => p.align-right.indent-first-line:fresh",
        "p[style-name='wp-justify-indent'] => p.align-justify.indent-first-line:fresh",
      ],
      transformDocument: transformWordAlignment,
    },
  );
  return sanitizeWordHtml(result.value);
}

function loadDocumentPreview(kind: 'word' | 'excel', url: string): Promise<ReadyDocumentPreviewState> {
  const key = `${kind}:${url}`;
  const cached = DOCUMENT_PREVIEW_CACHE.get(key);
  if (cached) return cached;

  const task = (async (): Promise<ReadyDocumentPreviewState> => {
    const buffer = await fetchPreviewBuffer(url);
    return kind === 'word'
      ? { status: 'word-ready', html: await parseWordDocument(buffer) }
      : { status: 'excel-ready', sheets: await parseExcelWorkbook(buffer) };
  })();
  if (DOCUMENT_PREVIEW_CACHE.size >= MAX_DOCUMENT_PREVIEWS) {
    const oldestKey = DOCUMENT_PREVIEW_CACHE.keys().next().value;
    if (oldestKey) DOCUMENT_PREVIEW_CACHE.delete(oldestKey);
  }
  DOCUMENT_PREVIEW_CACHE.set(key, task);
  task.catch(() => { if (DOCUMENT_PREVIEW_CACHE.get(key) === task) DOCUMENT_PREVIEW_CACHE.delete(key); });
  return task;
}

function DocumentLoading() {
  return (
    <div className="flex min-h-[24rem] items-center justify-center gap-2 rounded border bg-white p-8 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" />正在生成预览...
    </div>
  );
}

function DocumentError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 rounded border bg-white p-8 text-center">
      <FileText className="size-10 text-slate-300" />
      <p className="text-sm text-slate-600">{message}</p>
      <p className="text-xs text-slate-400">可以点击右上角“下载文件”后使用本地 Office 软件打开。</p>
    </div>
  );
}

function WordPreview({ html }: { html: string }) {
  return (
    <article
      className="mx-auto min-h-[24rem] w-full max-w-[794px] select-text rounded bg-white p-6 leading-[1.5] [&_a]:text-blue-700 [&_a]:underline [&_img]:max-h-[32rem] [&_img]:max-w-full [&_img]:object-contain [&_p]:whitespace-pre-wrap [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:p-2 [&_.align-center]:text-center [&_.align-center_img]:mx-auto [&_.align-center_img]:block [&_.align-right]:text-right [&_.align-justify]:text-justify [&_.indent-first-line]:[text-indent:2em]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function columnLabel(index: number) {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function ExcelPreview({ sheets }: { sheets: ExcelSheet[] }) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const activeSheet = sheets[Math.min(activeSheetIndex, Math.max(sheets.length - 1, 0))];

  useEffect(() => {
    setActiveSheetIndex(0);
  }, [sheets]);

  if (!activeSheet) {
    return <DocumentError message="Excel 文件中没有可显示的工作表。" />;
  }

  const maxColumns = activeSheet.rows.reduce((max, row) => Math.max(max, row.length), 0);

  return (
    <div className="min-h-[24rem] rounded border bg-white p-3 shadow-sm">
      {sheets.length > 1 && (
        <div className="mb-3 flex max-w-full gap-1 overflow-x-auto border-b pb-2" role="tablist" aria-label="工作表">
          {sheets.map((sheet, index) => (
            <button
              key={`${sheet.name}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === activeSheetIndex}
              onClick={() => setActiveSheetIndex(index)}
              className={`shrink-0 rounded px-3 py-1.5 text-sm ${index === activeSheetIndex ? 'bg-[#1e3a5f] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[calc(100dvh-13rem)] overflow-auto rounded border">
        {activeSheet.rows.length > 0 ? (
          <table className="w-full min-w-max border-collapse select-text text-left text-sm">
            <thead>
              <tr>
                <th className="border-b border-r border-slate-200 bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500">#</th>
                {Array.from({ length: maxColumns }, (_, columnIndex) => (
                  <th key={`col-${columnIndex}`} className="border-b border-r border-slate-200 bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500">
                    {columnLabel(columnIndex)}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-400">1</th>
                {activeSheet.rows[0].map((cell, columnIndex) => (
                  <th key={`head-${columnIndex}`} className="whitespace-pre-wrap border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700">
                    {cell ?? ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeSheet.rows.slice(1).map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <th className="border-b border-r border-slate-200 bg-white px-3 py-2 text-right text-xs tabular-nums text-slate-400">{rowIndex + 2}</th>
                  {Array.from({ length: maxColumns }, (_, columnIndex) => (
                    <td key={columnIndex} className="whitespace-pre-wrap border-b border-r border-slate-200 px-3 py-2 align-top last:border-r-0">
                      {row[columnIndex] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-8 text-center text-sm text-slate-500">当前工作表没有可显示的数据。</p>
        )}
      </div>
    </div>
  );
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  url,
  fileName,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  fileName?: string | null;
  title?: string;
}) {
  const kind: PreviewKind = url ? previewKind(fileName, url) : 'unsupported';
  const label = fileName || title || '文件预览';
  const [documentState, setDocumentState] = useState<DocumentPreviewState>(IDLE_DOCUMENT_STATE);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!open || !url || (kind !== 'word' && kind !== 'excel')) {
      return;
    }

    let cancelled = false;
    setDocumentState({ status: 'loading' });

    void loadDocumentPreview(kind, url)
      .then((state) => { if (!cancelled) setDocumentState(state); })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : '文件解析失败';
        setDocumentState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [kind, open, url]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setMinimized(false);
    onOpenChange(nextOpen);
  };

  return (
    <>
      <Dialog open={open && !minimized} onOpenChange={handleOpenChange}>
      <DialogContent className={`flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 ${kind === 'excel' ? 'sm:max-w-[calc(100vw-2rem)]' : 'sm:max-w-5xl'}`} style={kind === 'excel' ? { width: 'calc(100vw - 2rem)', maxWidth: 'calc(100vw - 2rem)' } : undefined}>
        <DialogHeader className="border-b px-5 py-4 pr-12 sm:flex-row sm:items-center sm:justify-between">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            {kind === 'image' ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
            <span className="truncate">{label}</span>
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            {url && (
              <a href={url} download={fileName || undefined} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                <Download className="size-4" />下载文件
              </a>
            )}
            <button type="button" onClick={() => setMinimized(true)} aria-label="缩小预览" title="缩小预览" className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <Minimize2 className="size-4" />
            </button>
          </div>
          <DialogDescription className="sr-only">{label}的网页内预览</DialogDescription>
        </DialogHeader>
        <div className={`min-h-0 flex-1 overflow-auto p-4 ${kind === 'word' ? 'bg-white' : 'bg-slate-100'}`}>
          {kind === 'image' && url && (
            <div className="flex min-h-[50dvh] items-center justify-center">
              <img src={url} alt={label} className="max-h-[calc(100dvh-10rem)] max-w-full select-text object-contain" />
            </div>
          )}
          {kind === 'pdf' && url && <iframe title={label} src={url} className="h-[calc(100dvh-10rem)] min-h-[32rem] w-full rounded border bg-white" />}
          {kind === 'word' && documentState.status === 'loading' && <DocumentLoading />}
          {kind === 'word' && documentState.status === 'word-ready' && <WordPreview html={documentState.html} />}
          {kind === 'excel' && documentState.status === 'loading' && <DocumentLoading />}
          {kind === 'excel' && documentState.status === 'excel-ready' && <ExcelPreview sheets={documentState.sheets} />}
          {(kind === 'word' || kind === 'excel') && documentState.status === 'error' && <DocumentError message={documentState.message} />}
          {kind === 'legacy-word' && <DocumentError message="旧版 Word（.doc）文件暂不支持网页内预览，请下载后使用 Word 打开。" />}
          {kind === 'unsupported' && <DocumentError message="此文件格式暂不支持网页内预览。" />}
        </div>
      </DialogContent>
      </Dialog>
      {open && minimized && (
        <button type="button" onClick={() => setMinimized(false)} className="fixed right-4 bottom-4 z-[60] inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg hover:bg-slate-50" aria-label="恢复文件预览">
          <Maximize2 className="size-4" />恢复预览
        </button>
      )}
    </>
  );
}

export function PreviewButton({
  url,
  fileName,
  label,
  onPreview,
}: {
  url: string | null | undefined;
  fileName?: string | null;
  label: string;
  onPreview: () => void;
}) {
  if (!url) return null;
  return <button type="button" onClick={onPreview} className="inline-flex max-w-full items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-left text-xs text-[#1e3a5f] hover:bg-blue-50"><FileText className="size-3 shrink-0" /><span className="truncate">{fileName || label}</span></button>;
}

export function FilePreviewLink({
  url,
  fileName,
  label,
  className = '',
}: {
  url: string | null | undefined;
  fileName?: string | null;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const kind = url ? previewKind(fileName, url) : 'unsupported';
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
  }, []);

  const prefetch = () => {
    if (!url || (kind !== 'word' && kind !== 'excel') || prefetchTimer.current) return;
    prefetchTimer.current = setTimeout(() => {
      prefetchTimer.current = null;
      void loadDocumentPreview(kind, url).catch(() => undefined);
    }, 160);
  };
  const cancelPrefetch = () => {
    if (prefetchTimer.current) {
      clearTimeout(prefetchTimer.current);
      prefetchTimer.current = null;
    }
  };

  if (!url) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} onMouseEnter={prefetch} onFocus={prefetch} onMouseLeave={cancelPrefetch} onBlur={cancelPrefetch} className={`inline-flex max-w-full items-center gap-1 text-left hover:underline ${className}`} title={`预览${fileName || label}`}>
        <FileText className="size-3 shrink-0" />
        <span className="truncate">{fileName || label}</span>
      </button>
      <FilePreviewDialog open={open} onOpenChange={setOpen} url={url} fileName={fileName} title={label} />
    </>
  );
}
