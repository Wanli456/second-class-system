'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Image as ImageIcon, Loader2, Maximize2, Minimize2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { previewKind, type PreviewKind } from '@/lib/file-preview';
import { apiFetch } from '@/lib/client-api';
import type { ExcelPreviewSheet } from '@/lib/excel-preview';

type DocumentPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'word-ready'; html: string }
  | { status: 'excel-ready'; sheets: ExcelPreviewSheet[] }
  | { status: 'error'; message: string };

const IDLE_DOCUMENT_STATE: DocumentPreviewState = { status: 'idle' };
type ReadyDocumentPreviewState = Extract<DocumentPreviewState, { status: 'word-ready' | 'excel-ready' }>;
const DOCUMENT_PREVIEW_CACHE = new Map<string, Promise<ReadyDocumentPreviewState>>();
const MAX_DOCUMENT_PREVIEWS = 8;

type MinimizedPreview = {
  id: string;
  fileName: string;
  label: string;
  kind: PreviewKind;
  restore: () => void;
  close: () => void;
};

const MINIMIZED_PREVIEWS = new Map<string, MinimizedPreview>();
const MINIMIZED_PREVIEW_LISTENERS = new Set<() => void>();

function notifyMinimizedPreviewChange() {
  MINIMIZED_PREVIEW_LISTENERS.forEach((listener) => listener());
}

function registerMinimizedPreview(preview: MinimizedPreview) {
  MINIMIZED_PREVIEWS.set(preview.id, preview);
  notifyMinimizedPreviewChange();
}

function removeMinimizedPreview(id: string) {
  if (MINIMIZED_PREVIEWS.delete(id)) notifyMinimizedPreviewChange();
}

function restoreMinimizedPreview(id: string) {
  const preview = MINIMIZED_PREVIEWS.get(id);
  if (!preview) return;
  MINIMIZED_PREVIEWS.delete(id);
  notifyMinimizedPreviewChange();
  preview.restore();
}

export function MinimizedPreviewDock() {
  const [, setVersion] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const update = () => setVersion((version) => version + 1);
    MINIMIZED_PREVIEW_LISTENERS.add(update);
    return () => { MINIMIZED_PREVIEW_LISTENERS.delete(update); };
  }, []);

  const previews = Array.from(MINIMIZED_PREVIEWS.values());
  if (previews.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-3 right-3 z-[100] w-[min(22rem,calc(100vw-1.5rem))] sm:bottom-4 sm:right-4">
      {expanded && <div className="mb-2 max-h-[min(24rem,calc(100dvh-7rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
        {previews.map((preview) => <div key={preview.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
          <FileText className="size-4 shrink-0 text-slate-500" />
          <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium text-slate-700">{preview.fileName}</p><p className="truncate text-xs text-slate-500">{preview.label}</p></div>
          <button type="button" onClick={() => { restoreMinimizedPreview(preview.id); setExpanded(false); }} className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">恢复</button>
          <button type="button" onClick={() => { removeMinimizedPreview(preview.id); preview.close(); }} className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-200" aria-label={`关闭${preview.fileName}`}><X className="size-4" /></button>
        </div>)}
      </div>}
      <button type="button" onClick={() => setExpanded((value) => !value)} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg hover:bg-slate-50" aria-expanded={expanded}>
        <Maximize2 className="size-4" />已缩小预览（{previews.length}）
      </button>
    </div>,
    document.body,
  );
}

function parseExcelWorkbook(buffer: ArrayBuffer): Promise<ExcelPreviewSheet[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./file-preview-worker.ts', import.meta.url));
    const id = Date.now();
    worker.onmessage = (event: MessageEvent<{ id: number; sheets?: ExcelPreviewSheet[]; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.sheets || []);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('Excel 文件解析失败'));
    };
    worker.postMessage({ id, buffer }, [buffer]);
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
    if (element instanceof HTMLImageElement) {
      element.loading = 'lazy';
      element.decoding = 'async';
    }
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

async function parseWordDocument(buffer: ArrayBuffer, mammothModulePromise = import('mammoth')): Promise<string> {
  const mammothModule = (await mammothModulePromise) as unknown as {
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
  if (cached) {
    DOCUMENT_PREVIEW_CACHE.delete(key);
    DOCUMENT_PREVIEW_CACHE.set(key, cached);
    return cached;
  }

  const task = (async (): Promise<ReadyDocumentPreviewState> => {
    const mammothModule = kind === 'word' ? import('mammoth') : undefined;
    const buffer = await fetchPreviewBuffer(url);
    return kind === 'word'
      ? { status: 'word-ready', html: await parseWordDocument(buffer, mammothModule) }
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

const EXCEL_ROWS_PER_PAGE = 100;
const EXCEL_COLUMNS_PER_GROUP = 50;

function ExcelPreview({ sheets }: { sheets: ExcelPreviewSheet[] }) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [columnGroup, setColumnGroup] = useState(0);
  const activeSheet = sheets[Math.min(activeSheetIndex, Math.max(sheets.length - 1, 0))];

  useEffect(() => {
    setActiveSheetIndex(0);
    setPage(0);
    setColumnGroup(0);
  }, [sheets]);

  const view = useMemo(() => {
    if (!activeSheet) return null;
    const dataRowCount = Math.max(0, activeSheet.rowCount - 1);
    const pageCount = Math.max(1, Math.ceil(dataRowCount / EXCEL_ROWS_PER_PAGE));
    const groupCount = Math.max(1, Math.ceil(activeSheet.columnCount / EXCEL_COLUMNS_PER_GROUP));
    const safePage = Math.min(page, pageCount - 1);
    const safeGroup = Math.min(columnGroup, groupCount - 1);
    const startColumn = activeSheet.startColumn + safeGroup * EXCEL_COLUMNS_PER_GROUP;
    const columns = Array.from({ length: Math.min(EXCEL_COLUMNS_PER_GROUP, activeSheet.columnCount - safeGroup * EXCEL_COLUMNS_PER_GROUP) }, (_, index) => startColumn + index);
    const startRow = activeSheet.startRow + 1 + safePage * EXCEL_ROWS_PER_PAGE;
    const rows = Array.from({ length: Math.min(EXCEL_ROWS_PER_PAGE, activeSheet.startRow + activeSheet.rowCount - startRow) }, (_, index) => startRow + index);
    return { pageCount, groupCount, safePage, safeGroup, columns, rows };
  }, [activeSheet, columnGroup, page]);

  if (!activeSheet || !view || activeSheet.rowCount === 0) {
    return <DocumentError message="Excel 文件中没有可显示的数据。" />;
  }

  const cell = (row: number, column: number) => activeSheet.cells[`${row}:${column}`] || '';
  return (
    <div className="min-h-[24rem] rounded border bg-white p-3 shadow-sm">
      {sheets.length > 1 && <div className="mb-3 flex max-w-full gap-1 overflow-x-auto border-b pb-2" role="tablist" aria-label="工作表">
        {sheets.map((sheet, index) => <button key={`${sheet.name}-${index}`} type="button" role="tab" aria-selected={index === activeSheetIndex} onClick={() => { setActiveSheetIndex(index); setPage(0); setColumnGroup(0); }} className={`shrink-0 rounded px-3 py-1.5 text-sm ${index === activeSheetIndex ? 'bg-[#1e3a5f] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{sheet.name}</button>)}
      </div>}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>共 {activeSheet.rowCount} 行、{activeSheet.columnCount} 列</span>
        <div className="flex items-center gap-2">
          {view.groupCount > 1 && <><button type="button" disabled={view.safeGroup === 0} onClick={() => setColumnGroup((current) => Math.max(0, current - 1))} className="rounded border px-2 py-1 disabled:opacity-40">上一列组</button><span>列组 {view.safeGroup + 1}/{view.groupCount}</span><button type="button" disabled={view.safeGroup + 1 === view.groupCount} onClick={() => setColumnGroup((current) => Math.min(view.groupCount - 1, current + 1))} className="rounded border px-2 py-1 disabled:opacity-40">下一列组</button></>}
          {view.pageCount > 1 && <><button type="button" disabled={view.safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="rounded border px-2 py-1 disabled:opacity-40">上一页</button><span>第 {view.safePage + 1}/{view.pageCount} 页</span><button type="button" disabled={view.safePage + 1 === view.pageCount} onClick={() => setPage((current) => Math.min(view.pageCount - 1, current + 1))} className="rounded border px-2 py-1 disabled:opacity-40">下一页</button></>}
        </div>
      </div>
      <div className="max-h-[calc(100dvh-16rem)] overflow-auto rounded border">
        <table className="w-full min-w-max border-collapse select-text text-left text-sm">
          <thead><tr><th className="border-b border-r border-slate-200 bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500">#</th>{view.columns.map((column) => <th key={column} className="border-b border-r border-slate-200 bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500">{columnLabel(column)}</th>)}</tr><tr><th className="border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-400">{activeSheet.startRow + 1}</th>{view.columns.map((column) => <th key={column} className="whitespace-pre-wrap border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700">{cell(activeSheet.startRow, column)}</th>)}</tr></thead>
          <tbody>{view.rows.map((row) => <tr key={row} className={(row - activeSheet.startRow) % 2 === 0 ? 'bg-white' : 'bg-slate-50'}><th className="border-b border-r border-slate-200 bg-white px-3 py-2 text-right text-xs tabular-nums text-slate-400">{row + 1}</th>{view.columns.map((column) => <td key={column} className="whitespace-pre-wrap border-b border-r border-slate-200 px-3 py-2 align-top last:border-r-0">{cell(row, column)}</td>)}</tr>)}</tbody>
        </table>
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
  previewId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  fileName?: string | null;
  title?: string;
  previewId?: string;
}) {
  const generatedPreviewId = useId();
  const instanceId = previewId || generatedPreviewId;
  const kind: PreviewKind = url ? previewKind(fileName, url) : 'unsupported';
  const label = fileName || title || '文件预览';
  const [documentState, setDocumentState] = useState<DocumentPreviewState>(IDLE_DOCUMENT_STATE);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!open) {
      setMinimized(false);
      removeMinimizedPreview(instanceId);
    }
  }, [instanceId, open]);

  useEffect(() => () => removeMinimizedPreview(instanceId), [instanceId]);

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
    if (!nextOpen) {
      setMinimized(false);
      removeMinimizedPreview(instanceId);
    }
    onOpenChange(nextOpen);
  };

  const minimize = () => {
    setMinimized(true);
    registerMinimizedPreview({
      id: instanceId,
      fileName: fileName || label,
      label: title || '文件预览',
      kind,
      restore: () => setMinimized(false),
      close: () => onOpenChange(false),
    });
  };

  return (
    <>
      <Dialog open={open && !minimized} onOpenChange={handleOpenChange}>
      <DialogContent data-file-preview className={`flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 ${kind === 'excel' ? 'sm:max-w-[calc(100vw-2rem)]' : 'sm:max-w-5xl'}`} style={kind === 'excel' ? { width: 'calc(100vw - 2rem)', maxWidth: 'calc(100vw - 2rem)' } : undefined}>
        <DialogHeader className="flex-wrap border-b px-3 py-3 pr-12 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            {kind === 'image' ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
            <span className="truncate">{label}</span>
          </DialogTitle>
          <div className="mr-10 flex w-[calc(100%-2.5rem)] min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            {url && (
              <a href={url} download={fileName || undefined} className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 sm:flex-none">
                <Download className="size-4" />下载文件
              </a>
            )}
            <button type="button" onClick={minimize} aria-label="缩小预览" title="缩小预览" className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
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
  const dialogId = useId();
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
      <button type="button" onClick={() => { restoreMinimizedPreview(dialogId); setOpen(true); }} onMouseEnter={prefetch} onFocus={prefetch} onMouseLeave={cancelPrefetch} onBlur={cancelPrefetch} className={`inline-flex max-w-full items-center gap-1 text-left hover:underline ${className}`} title={`预览${fileName || label}`}>
        <FileText className="size-3 shrink-0" />
        <span className="truncate">{fileName || label}</span>
      </button>
      <FilePreviewDialog open={open} onOpenChange={setOpen} url={url} fileName={fileName} title={label} previewId={dialogId} />
    </>
  );
}
