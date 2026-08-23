import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { assertSafeRemoteImageUrl } from '@/lib/image-url';

function resolvePythonPath(): string {
  const root = process.cwd();
  const candidate = process.platform === 'win32'
    ? path.join(root, '.ocr-venv', 'Scripts', 'python.exe')
    : path.join(root, '.ocr-venv', 'bin', 'python');
  if (existsSync(candidate)) return candidate;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runHashScript(pythonPath: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(pythonPath, args, { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('图片哈希计算超时'));
    }, 60000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`图片哈希脚本退出码：${code}`));
    });
  });
}

export type ImageHash = { url: string; sha256?: string; dhash?: string; phash?: string };

export async function computeImageHashes(urls: string[]): Promise<ImageHash[]> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ds-hash-'));
  try {
    const localPaths: Array<{ url: string; localPath: string }> = [];
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index].trim();
      if (!url) continue;
      const localPath = await resolveLocalImage(url, tempDir, index);
      if (localPath && existsSync(localPath)) localPaths.push({ url, localPath });
    }
    if (!localPaths.length) return [];

    const sha256ByPath = new Map<string, string>();
    for (const item of localPaths) {
      const bytes = await readFile(item.localPath);
      sha256ByPath.set(item.localPath, createHash('sha256').update(bytes).digest('hex'));
    }

    const dhashByPath = new Map<string, { dhash?: string; phash?: string }>();
    const scriptPath = path.join(process.cwd(), 'local-ocr', 'image_hash.py');
    if (existsSync(scriptPath)) {
      try {
        const outputPath = path.join(tempDir, 'hash.json');
        await runHashScript(resolvePythonPath(), [scriptPath, outputPath, ...localPaths.map((item) => item.localPath)]);
        const raw = await readFile(outputPath, 'utf8');
        const result = JSON.parse(raw);
        if (result?.ok) {
          for (const item of result.hashes || []) {
            if (!item?.path) continue;
            dhashByPath.set(String(item.path), {
              dhash: item.dhash ? String(item.dhash) : undefined,
              phash: item.phash ? String(item.phash) : undefined,
            });
          }
        }
      } catch (error) {
        console.warn('感知哈希计算跳过，将仅保留 SHA-256:', error instanceof Error ? error.message : error);
      }
    }

    return localPaths.flatMap((item) => {
      const perceptual = dhashByPath.get(item.localPath) || {};
      const sha256 = sha256ByPath.get(item.localPath);
      if (!sha256 && !perceptual.dhash) return [];
      return [{
        url: item.url,
        sha256,
        dhash: perceptual.dhash,
        phash: perceptual.phash,
      }];
    });
  } catch (error) {
    console.warn('图片哈希计算跳过:', error instanceof Error ? error.message : error);
    return [];
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function hammingDistance(hexA: string, hexB: string): number {
  try {
    const a = hexA.replace(/^0x/i, '').toLowerCase().padStart(16, '0').slice(0, 16);
    const b = hexB.replace(/^0x/i, '').toLowerCase().padStart(16, '0').slice(0, 16);
    let count = 0;
    for (let offset = 0; offset < 16; offset += 8) {
      const x = parseInt(a.slice(offset, offset + 8), 16);
      const y = parseInt(b.slice(offset, offset + 8), 16);
      let xor = (x ^ y) >>> 0;
      while (xor > 0) {
        count += xor & 1;
        xor >>>= 1;
      }
    }
    return count;
  } catch {
    return 64;
  }
}

export function imageSimilarityPercent(hexA: string, hexB: string): number {
  const distance = hammingDistance(hexA, hexB);
  return Math.round(100 - (distance / 64) * 100);
}

async function resolveLocalImage(imageUrl: string, tempDir: string, index: number): Promise<string | null> {
  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      if (!(await assertSafeRemoteImageUrl(imageUrl))) return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(imageUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) return null;
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength && contentLength > 8 * 1024 * 1024) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 8 * 1024 * 1024) return null;
      const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
      const inputPath = path.join(tempDir, `hash-${index}.${ext}`);
      await writeFile(inputPath, buffer);
      return inputPath;
    } catch {
      return null;
    }
  }
  if (imageUrl.startsWith('/uploads/') && !imageUrl.includes('..')) {
    const fileName = imageUrl.split('/').pop() || '';
    const inputPath = path.join(process.cwd(), 'public', 'uploads', fileName);
    return existsSync(inputPath) ? inputPath : null;
  }
  return null;
}
