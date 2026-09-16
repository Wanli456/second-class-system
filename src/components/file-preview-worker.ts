/// <reference lib="webworker" />

import { workbookToPreviewSheets } from '@/lib/excel-preview';

type ParseRequest = { id: number; buffer: ArrayBuffer };

self.addEventListener('message', async (event: MessageEvent<ParseRequest>) => {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(event.data.buffer, { type: 'array', cellDates: true });
    self.postMessage({ id: event.data.id, sheets: workbookToPreviewSheets(workbook, XLSX.utils) });
  } catch (error: unknown) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'Excel 文件解析失败',
    });
  }
});
