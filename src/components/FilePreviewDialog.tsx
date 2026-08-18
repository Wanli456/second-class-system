'use client';

import { useState } from 'react';
import { Download, FileText, Image as ImageIcon, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type PreviewKind = 'image' | 'pdf' | 'unsupported';

function previewKind(fileName: string | null | undefined, url: string): PreviewKind {
  const source = `${fileName || ''} ${url}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(source)) return 'image';
  if (/\.pdf(\?|$)/i.test(source)) return 'pdf';
  return 'unsupported';
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
  const kind = url ? previewKind(fileName, url) : 'unsupported';
  const label = fileName || title || '文件预览';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 truncate text-base">
            {kind === 'image' ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
            <span className="truncate">{label}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">{label}的网页内预览</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
          {kind === 'image' && url && (
            <div className="flex min-h-[50dvh] items-center justify-center">
              <img src={url} alt={label} className="max-h-[calc(100dvh-10rem)] max-w-full select-text object-contain" />
            </div>
          )}
          {kind === 'pdf' && url && (
            <iframe title={label} src={url} className="h-[calc(100dvh-10rem)] min-h-[32rem] w-full rounded border bg-white" />
          )}
          {kind === 'unsupported' && (
            <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 rounded border bg-white p-8 text-center">
              <FileText className="size-10 text-slate-300" />
              <p className="text-sm text-slate-600">此文件格式暂不支持网页内预览。</p>
              {url && <a href={url} download={fileName || undefined} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white"><Download className="size-4" />下载文件</a>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
  if (!url) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex max-w-full items-center gap-1 text-left hover:underline ${className}`} title={`预览${fileName || label}`}>
        <FileText className="size-3 shrink-0" />
        <span className="truncate">{fileName || label}</span>
      </button>
      <FilePreviewDialog open={open} onOpenChange={setOpen} url={url} fileName={fileName} title={label} />
    </>
  );
}
