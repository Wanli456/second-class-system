'use client';

type CacheEntry = {
  promise: Promise<string>;
  objectUrl: string | null;
  size: number;
  references: number;
  lastUsed: number;
};

type ImagePreviewLease = {
  promise: Promise<string>;
  release: () => void;
};

const MAX_CACHED_IMAGES = 24;
const MAX_CACHED_BYTES = 64 * 1024 * 1024;
const IMAGE_URL_PATTERN = /^\/uploads\//;
const IMAGE_PREVIEW_CACHE = new Map<string, CacheEntry>();
let cachedBytes = 0;
let cacheGeneration = 0;

export function isSessionImageUrl(url: string): boolean {
  return IMAGE_URL_PATTERN.test(url);
}

function evictUnusedImages() {
  while (IMAGE_PREVIEW_CACHE.size > MAX_CACHED_IMAGES || cachedBytes > MAX_CACHED_BYTES) {
    const candidate = [...IMAGE_PREVIEW_CACHE.entries()]
      .filter(([, entry]) => entry.references === 0 && entry.objectUrl)
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed)[0];
    if (!candidate) return;

    const [url, entry] = candidate;
    IMAGE_PREVIEW_CACHE.delete(url);
    cachedBytes -= entry.size;
    URL.revokeObjectURL(entry.objectUrl!);
  }
}

function createEntry(url: string): CacheEntry {
  const generation = cacheGeneration;
  const entry = {} as CacheEntry;
  entry.objectUrl = null;
  entry.size = 0;
  entry.references = 0;
  entry.lastUsed = Date.now();
  entry.promise = fetch(url, { credentials: 'include', cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`图片读取失败（HTTP ${response.status}）`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (generation !== cacheGeneration) {
        URL.revokeObjectURL(objectUrl);
        throw new Error('图片预览缓存已失效');
      }
      entry.objectUrl = objectUrl;
      entry.size = blob.size;
      cachedBytes += blob.size;
      evictUnusedImages();
      return objectUrl;
    })
    .catch((error: unknown) => {
      if (IMAGE_PREVIEW_CACHE.get(url) === entry) IMAGE_PREVIEW_CACHE.delete(url);
      throw error;
    });
  IMAGE_PREVIEW_CACHE.set(url, entry);
  return entry;
}

export function acquireImagePreview(url: string): ImagePreviewLease {
  if (!isSessionImageUrl(url)) return { promise: Promise.resolve(url), release: () => undefined };

  const entry = IMAGE_PREVIEW_CACHE.get(url) || createEntry(url);
  entry.references += 1;
  entry.lastUsed = Date.now();

  let released = false;
  return {
    promise: entry.promise,
    release: () => {
      if (released) return;
      released = true;
      entry.references = Math.max(0, entry.references - 1);
      entry.lastUsed = Date.now();
      evictUnusedImages();
    },
  };
}

export function clearImagePreviewCache() {
  cacheGeneration += 1;
  for (const entry of IMAGE_PREVIEW_CACHE.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  }
  IMAGE_PREVIEW_CACHE.clear();
  cachedBytes = 0;
}
