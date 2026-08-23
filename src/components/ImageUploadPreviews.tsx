'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { FilePreviewDialog } from '@/components/FilePreviewDialog';

type ImageUploadPreviewsProps = {
  imageUrls: string[];
  altPrefix: string;
  onRemove?: (index: number) => void;
};

export function ImageUploadPreviews({ imageUrls, altPrefix, onRemove }: ImageUploadPreviewsProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedUrl = selectedIndex === null ? null : imageUrls[selectedIndex] || null;

  if (!imageUrls.length) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {imageUrls.map((url, index) => (
          <div key={url.slice(0, 48) + "-" + index} className="group relative size-24">
            <button type="button" onClick={() => setSelectedIndex(index)} className="size-full overflow-hidden rounded-md border border-slate-200 bg-white text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" aria-label={"放大查看" + altPrefix + " " + (index + 1)} title="点击放大查看">
              <img src={url} alt={altPrefix + " " + (index + 1)} className="size-full object-contain" />
              <span className="absolute inset-x-0 bottom-0 bg-slate-950/70 px-1 py-0.5 text-center text-[10px] text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">放大查看</span>
            </button>
            {onRemove && <button type="button" onClick={() => onRemove(index)} className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-white bg-slate-900 text-white shadow-sm hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600" aria-label={"移除" + altPrefix + " " + (index + 1)} title="移除图片"><X className="size-3.5" /></button>}
          </div>
        ))}
      </div>
      <FilePreviewDialog open={selectedIndex !== null} onOpenChange={(open) => { if (!open) setSelectedIndex(null); }} url={selectedUrl} fileName={selectedIndex === null ? null : altPrefix + "-" + (selectedIndex + 1) + ".jpg"} title={altPrefix + "预览"} />
    </>
  );
}
