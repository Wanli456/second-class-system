import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

function resolvePythonPath() {
  const root = process.cwd();
  const candidate = process.platform === 'win32'
    ? path.join(root, '.ocr-venv', 'Scripts', 'python.exe')
    : path.join(root, '.ocr-venv', 'bin', 'python');
  if (existsSync(candidate)) return candidate;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runHashScript(pythonPath: string, args: string[]) {
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

export type ImageHash = { url: string; dhash: string; phash?: string };

export async function computeImageHashes(urls: string[]): Promise<ImageHash[]> {
  const scriptPath = path.join(process.cwd(), 'local-ocr', 'image_hash.py');
  if (!existsSync(scriptPath)) return [];

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

    const outputPath = path.join(tempDir, 'hash.json');
    const pythonPath = resolvePythonPath();
    await runHashScript(pythonPath, [scriptPath, outputPath, ...localPaths.map((item) => item.localPath)]);

    const raw = await readFile(outputPath, 'utf8');
    const result = JSON.parse(raw);
    if (!result?.ok) return [];
    const byPath = new Map(localPaths.map((item) => [item.localPath, item.url]));

    return (result.hashes || []).flatMap((item: { path?: unknown; dhash?: unknown; phash?: unknown }) => {
      if (!item?.dhash) return [];
      const url = byPath.get(String(item.path)) || String(item.path || '');
      return [{ url, dhash: String(item.dhash), phash: item.phash ? String(item.phash) : undefined }];
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
      const response = await fetch(imageUrl);
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
      const inputPath = path.join(tempDir, `hash-${index}.${ext}`);
      await writeFile(inputPath, buffer);
      return inputPath;
    } catch {
      return null;
    }
  }
  if (imageUrl.startsWith('/uploads/')) {
    const fileName = imageUrl.split('/').pop() || '';
    const inputPath = path.join(process.cwd(), 'public', 'uploads', fileName);
    return existsSync(inputPath) ? inputPath : null;
  }
  return null;
}