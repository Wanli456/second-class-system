import assert from 'node:assert/strict';
import { acquireImagePreview, clearImagePreviewCache } from './image-preview-cache';

const originalFetch = globalThis.fetch;
const urlApi = URL as typeof URL & {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};
const originalCreateObjectURL = urlApi.createObjectURL;
const originalRevokeObjectURL = urlApi.revokeObjectURL;

async function run() {
  let fetchCount = 0;
  let objectUrlCount = 0;
  const revoked: string[] = [];
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(new Blob(['image-data'], { type: 'image/png' }), { status: 200 });
  };
  urlApi.createObjectURL = () => `blob:test-${++objectUrlCount}`;
  urlApi.revokeObjectURL = (url) => revoked.push(url);

  try {
    clearImagePreviewCache();
    const first = acquireImagePreview('/uploads/photo.png');
    const second = acquireImagePreview('/uploads/photo.png');
    assert.equal(await first.promise, 'blob:test-1');
    assert.equal(await second.promise, 'blob:test-1');
    assert.equal(fetchCount, 1, '同一图片并发预览只能请求一次');
    first.release();
    second.release();

    const repeated = acquireImagePreview('/uploads/photo.png');
    assert.equal(await repeated.promise, 'blob:test-1');
    assert.equal(fetchCount, 1, '重复打开应命中当前页面缓存');
    repeated.release();

    const local = acquireImagePreview('blob:local-preview');
    assert.equal(await local.promise, 'blob:local-preview');
    local.release();
    assert.equal(fetchCount, 1, '本地选择的 blob 预览不应发网络请求');

    clearImagePreviewCache();
    assert.deepEqual(revoked, ['blob:test-1']);
    const afterClear = acquireImagePreview('/uploads/photo.png');
    assert.equal(await afterClear.promise, 'blob:test-2');
    assert.equal(fetchCount, 2, '清空缓存后应重新读取');
    afterClear.release();

    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response('denied', { status: 403 });
    };
    await assert.rejects(acquireImagePreview('/uploads/denied.png').promise, /HTTP 403/);
    await assert.rejects(acquireImagePreview('/uploads/denied.png').promise, /HTTP 403/, '失败请求不得进入缓存');
    assert.equal(fetchCount, 4);
    console.log('image preview cache tests passed');
  } finally {
    clearImagePreviewCache();
    globalThis.fetch = originalFetch;
    urlApi.createObjectURL = originalCreateObjectURL;
    urlApi.revokeObjectURL = originalRevokeObjectURL;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
