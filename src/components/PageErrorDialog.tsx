'use client';

import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type NoticeTone = 'error' | 'warning' | 'success';

const TONE_STYLES: Record<NoticeTone, { icon: typeof AlertCircle; className: string }> = {
  error: { icon: AlertCircle, className: 'text-rose-500' },
  warning: { icon: AlertTriangle, className: 'text-amber-500' },
  success: { icon: CheckCircle2, className: 'text-emerald-600' },
};

export function PageErrorDialog({
  open,
  message,
  onClose,
  tone = 'warning',
}: {
  open: boolean;
  message: string | null;
  onClose: () => void;
  tone?: NoticeTone;
}) {
  const { icon: Icon, className } = TONE_STYLES[tone];
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md rounded-xl border-slate-200 bg-white p-0 sm:max-w-md">
        <DialogHeader className="border-b border-slate-100 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <Icon className={`size-5 ${className}`} />
            提示
          </DialogTitle>
        </DialogHeader>
        <p className="whitespace-pre-wrap px-5 py-4 text-sm leading-6 text-slate-700">{message}</p>
        <DialogFooter className="px-5 pb-5">
          <Button type="button" onClick={onClose} className="bg-slate-950 text-white hover:bg-slate-800">知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}