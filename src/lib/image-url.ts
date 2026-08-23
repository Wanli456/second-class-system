import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map((part) => Number(part));
    return (
      parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
  }
  return false;
}

const BLOCKED_HOST_PATTERN = /(\.local|\.internal|\.localhost)$/i;

/**
 * 只允许访问公网 http(s) 图片地址，拒绝内网/本机/元数据地址。
 * 用于 OCR、图片哈希等需要按客户端 URL 拉取图片的接口，防止 SSRF。
 */
export async function assertSafeRemoteImageUrl(raw: string): Promise<boolean> {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const hostname = url.hostname;
    if (isIP(hostname)) return !isPrivateIp(hostname);
    if (BLOCKED_HOST_PATTERN.test(hostname)) return false;

    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.length > 0 && records.every((record) => !isPrivateIp(record.address));
  } catch {
    return false;
  }
}
