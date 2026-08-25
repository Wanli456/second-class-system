import assert from 'node:assert/strict';
import { refreshCurrentUser } from './client-api';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });

async function run() {
  try {
    storage.setItem('user', JSON.stringify({ id: 'cached-user', role: 'admin', sessionToken: 'legacy-token' }));
    globalThis.fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Authorization'), 'Bearer legacy-token');
      assert.equal(init?.credentials, 'include');
      return new Response(JSON.stringify({ success: true, data: { id: 'live-user', role: 'admin' } }));
    };

    assert.deepEqual(await refreshCurrentUser(), { id: 'live-user', role: 'admin' });
    assert.deepEqual(JSON.parse(storage.getItem('user')!), { id: 'live-user', role: 'admin' });

    storage.setItem('user', JSON.stringify({ id: 'expired-user', role: 'admin', sessionToken: 'expired-token' }));
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), { status: 401 });
    assert.equal(await refreshCurrentUser(), null);
    assert.equal(storage.getItem('user'), null);

    console.log('client-api migration tests passed');
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    globalThis.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
