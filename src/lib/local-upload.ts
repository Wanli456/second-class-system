import path from 'path';

export function safeUploadFileName(value: string): string | null {
  const fileName = value.trim();
  if (!fileName || fileName !== path.basename(fileName) || fileName === '.' || fileName === '..') return null;
  return fileName;
}
