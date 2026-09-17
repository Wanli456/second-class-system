'use client';

import { Download } from 'lucide-react';
import { FilePreviewLink } from '@/components/FilePreviewDialog';
import { parseStoredRecordPhotos } from '@/lib/other-college-record-photos';

type RecordPhotoLinksProps = {
  recordPhotoList?: string | null;
  recordPhotoUrl?: string | null;
  recordPhotoFileName?: string | null;
  emptyLabel?: string;
  className?: string;
  itemClassName?: string;
};

export function RecordPhotoLinks({
  recordPhotoList,
  recordPhotoUrl,
  recordPhotoFileName,
  emptyLabel = '未上传备案表照片',
  className = 'flex flex-wrap items-center gap-2',
  itemClassName = 'rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50',
}: RecordPhotoLinksProps) {
  const photos = parseStoredRecordPhotos(recordPhotoList, recordPhotoUrl, recordPhotoFileName);
  if (!photos.length) return <span className="text-xs text-slate-400">{emptyLabel}</span>;

  return <div className={className}>{photos.map((photo, index) => <div key={photo.url} className="flex max-w-full items-center gap-2"><FilePreviewLink url={photo.url} fileName={photo.fileName} label={photos.length > 1 ? `备案表照片 ${index + 1}` : '备案表照片'} className={itemClassName} /><a href={photo.url} download={photo.fileName} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"><Download className="size-3" aria-hidden="true" />下载</a></div>)}</div>;
}
