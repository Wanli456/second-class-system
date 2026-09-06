import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const service = readFileSync(path.join(root, 'deploy/systemd/second-class.service'), 'utf8');
const docs = readFileSync(path.join(root, 'docs/PRODUCTION-SYSTEMD.md'), 'utf8');

assert.match(service, /REFERENCE ONLY/);
assert.match(service, /DO NOT install, copy, or overwrite the live unit/);
assert.match(service, /ExecStart=\/usr\/bin\/node \/opt\/second-class\/dist\/server\.js/);
assert.match(service, /Restart=on-failure/);
assert.match(service, /EnvironmentFile=\/etc\/second-class\/second-class\.env/);
assert.doesNotMatch(service, /sk-[A-Za-z0-9]|postgresql:\/\/[^\s]*:[^\s]*@/);
assert.match(docs, /仅是参考模板，禁止直接复制、安装或覆盖/);
assert.match(docs, /2026-09-05 20:10:02 \+08:00/);
assert.match(docs, /ActiveState=active/);
assert.match(docs, /UnitFileState=enabled/);
assert.match(docs, /Restart=always/);
assert.match(docs, /RestartUSec=3s/);
assert.match(docs, /未做进程退出或重启试验/);
assert.match(docs, /必须另行授权的步骤/);
assert.match(docs, /未执行 `systemctl cat`/);
assert.doesNotMatch(docs, /```bash[\s\S]*systemctl cat/);
assert.doesNotMatch(docs, /systemctl enable --now/);
assert.doesNotMatch(docs, /sudo install -m 0644 deploy\/systemd\/second-class\.service/);
console.log('production service config passed');
