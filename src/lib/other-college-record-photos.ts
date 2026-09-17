export type RecordPhoto = { url: string; fileName: string };

export const MAX_OTHER_COLLEGE_RECORD_PHOTOS = 10;

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fallbackFileName(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1) || '备案表照片';
}

function parsePhoto(value: unknown): RecordPhoto | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as { url?: unknown; fileName?: unknown; name?: unknown };
  const url = optionalText(item.url);
  if (!url) return null;
  return { url, fileName: optionalText(item.fileName) || optionalText(item.name) || fallbackFileName(url) };
}

function parseArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function legacyPhoto(urlValue: unknown, fileNameValue: unknown): RecordPhoto[] {
  const url = optionalText(urlValue);
  return url ? [{ url, fileName: optionalText(fileNameValue) || fallbackFileName(url) }] : [];
}

export function parseStoredRecordPhotos(value: unknown, legacyUrl?: unknown, legacyFileName?: unknown): RecordPhoto[] {
  const parsed = parseArray(value)?.map(parsePhoto).filter((item): item is RecordPhoto => Boolean(item)) || [];
  const unique = parsed.filter((photo, index) => parsed.findIndex((item) => item.url === photo.url) === index);
  return unique.length ? unique : legacyPhoto(legacyUrl, legacyFileName);
}

export function parseRecordPhotoInputs(value: unknown, legacyUrl?: unknown, legacyFileName?: unknown): RecordPhoto[] {
  if (value === undefined) return legacyPhoto(legacyUrl, legacyFileName);
  if (!Array.isArray(value)) throw new Error('备案表照片格式不正确');
  if (value.length > MAX_OTHER_COLLEGE_RECORD_PHOTOS) throw new Error('备案表照片最多上传 10 张');
  const photos = value.map(parsePhoto);
  if (photos.some((photo) => !photo || !photo.url.startsWith('/uploads/'))) throw new Error('备案表照片地址不正确');
  const validPhotos = photos as RecordPhoto[];
  if (new Set(validPhotos.map((photo) => photo.url)).size !== validPhotos.length) throw new Error('备案表照片不能重复');
  return validPhotos;
}
