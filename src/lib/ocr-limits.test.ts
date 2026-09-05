import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { downloadOcrImage, parseOcrImageUrls, tryAcquireOcrSlot } from './ocr-limits';

async function run() {
  assert.deepEqual(parseOcrImageUrls({ image_url: ' /uploads/one.png ' }), ['/uploads/one.png']);
  assert.deepEqual(parseOcrImageUrls({ image_urls: ['/uploads/one.png'] }), ['/uploads/one.png']);
  assert.throws(() => parseOcrImageUrls({ imageUrls: Array(11).fill('/uploads/one.png') }), /10/);
  assert.throws(() => parseOcrImageUrls({ imageUrls: [{}] }), /图片地址/);
  assert.throws(() => parseOcrImageUrls(null), /参数/);
  const release1 = tryAcquireOcrSlot('one');
  assert.ok(release1);
  assert.equal(tryAcquireOcrSlot('one'), null);
  const release2 = tryAcquireOcrSlot('two');
  assert.ok(release2);
  assert.equal(tryAcquireOcrSlot('three'), null);
  release1(); release1();
  const release3 = tryAcquireOcrSlot('three');
  assert.ok(release3);
  assert.equal(tryAcquireOcrSlot('four'), null, 'Releasing twice must not free another slot');
  release2(); release3();

  const server = createServer((req, res) => {
    if (req.url === '/slow') {
      res.writeHead(200); res.write('a');
      return;
    }
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/ok' }); res.end(); return; }
    if (req.url === '/large-header') res.setHeader('Content-Length', '99999');
    res.write('12345678'); res.end('12345678');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await downloadOcrImage(`${base}/ok`, { maxBytes: 16 })).length, 16);
    await assert.rejects(downloadOcrImage(`${base}/large`, { maxBytes: 8 }), /大小限制/);
    await assert.rejects(downloadOcrImage(`${base}/large-header`, { maxBytes: 8 }), /大小限制/);
    await assert.rejects(downloadOcrImage(`${base}/slow`, { timeoutMs: 50 }), /超时/);
    await assert.rejects(downloadOcrImage(`${base}/redirect`));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
