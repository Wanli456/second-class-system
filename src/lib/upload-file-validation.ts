const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif']);
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv']);

export type UploadFileKind = 'image' | 'document';

export function getUploadFileKind(fileName: string): UploadFileKind | null {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (DOCUMENT_EXTENSIONS.has(extension)) return 'document';
  return null;
}

export function getUploadContentType(fileName: string, suppliedType: string): string {
  if (suppliedType.trim()) return suppliedType;
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const contentTypes: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv',
  };
  return contentTypes[extension] || 'application/octet-stream';
}

export const UPLOAD_FILE_FORMAT_HINT = '图片（jpg/jpeg/png/gif/webp/bmp/heic/heif）或常用文档（pdf/doc/docx/xls/xlsx/ppt/pptx/csv）';
