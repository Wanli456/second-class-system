const MAX_IMAGES = 10;
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const activeUsers = new Set<string>();

export function parseOcrImageUrls(body: unknown): string[] {
  if (!body || typeof body !== 'object') throw new Error('图片参数无效');
  const input = body as Record<string, unknown>;
  const raw = Array.isArray(input.imageUrls) ? input.imageUrls
    : Array.isArray(input.image_urls) ? input.image_urls
      : [input.imageUrl || input.image_url].filter(Boolean);
  if (!raw.length) throw new Error('缺少 imageUrl 或 imageUrls 参数');
  if (raw.length > MAX_IMAGES) throw new Error(`每次最多识别 ${MAX_IMAGES} 张图片，请分批提交`);
  if (raw.some((url) => typeof url !== 'string' || !url.trim() || url.length > 2048)) {
    throw new Error('图片地址无效');
  }
  return raw.map((url: string) => url.trim());
}

export function tryAcquireOcrSlot(userId: string): (() => void) | null {
  // Process-local bound: multiple server processes need a shared queue instead.
  if (activeUsers.has(userId) || activeUsers.size >= 2) return null;
  activeUsers.add(userId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeUsers.delete(userId);
  };
}

// The caller validates public URLs before calling; redirects are never followed.
export async function downloadOcrImage(
  url: string, { maxBytes = MAX_DOWNLOAD_BYTES, timeoutMs = 15_000 } = {},
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}`);
    if (Number(response.headers.get('content-length') || 0) > maxBytes) {
      throw new Error('远程图片超过大小限制（最大 8MB）');
    }
    if (!response.body) throw new Error('远程图片内容为空');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('远程图片超过大小限制（最大 8MB）');
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('下载图片超时');
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
