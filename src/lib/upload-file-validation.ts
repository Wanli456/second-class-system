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

// 仅校验文件头的“魔数”，防止把可执行文件等危险内容改个扩展名伪装成图片/文档上传。
// office 新格式(docx/xlsx/pptx)和部分旧格式内部都是 zip 容器，只能识别到 zip 级别，无法细分。
const MAGIC_SIGNATURES: Array<{ kind: UploadFileKind; bytes: number[]; offset?: number }> = [
  { kind: 'image', bytes: [0xff, 0xd8, 0xff] }, // jpg/jpeg
  { kind: 'image', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // png
  { kind: 'image', bytes: [0x47, 0x49, 0x46, 0x38] }, // gif
  { kind: 'image', bytes: [0x42, 0x4d] }, // bmp
  { kind: 'document', bytes: [0x25, 0x50, 0x44, 0x46] }, // pdf
  { kind: 'document', bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // legacy doc/xls/ppt (OLE2)
  { kind: 'document', bytes: [0x50, 0x4b, 0x03, 0x04] }, // docx/xlsx/pptx/zip
];

function matchesSignature(buffer: Buffer, signature: { bytes: number[]; offset?: number }): boolean {
  const offset = signature.offset || 0;
  if (buffer.length < offset + signature.bytes.length) return false;
  return signature.bytes.every((byte, index) => buffer[offset + index] === byte);
}

export function detectFileKindFromBytes(buffer: Buffer, fileName = ''): UploadFileKind | null {
  if (buffer.length >= 12 && matchesSignature(buffer, { bytes: [0x52, 0x49, 0x46, 0x46] }) && matchesSignature(buffer, { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 })) return 'image';
  if (buffer.length >= 12 && matchesSignature(buffer, { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 })) {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image';
  }
  for (const signature of MAGIC_SIGNATURES) {
    if (matchesSignature(buffer, signature)) return signature.kind;
  }
  // csv 是纯文本，没有固定魔数；放宽为不含空字节的可打印内容即可。
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (extension !== 'csv') return null;
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  if (sample.length > 0 && !sample.includes(0)) return 'document';
  return null;
}
