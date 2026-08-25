import assert from 'node:assert/strict';
import { formatActivityScopes, normalizeIds, serializeIds } from './business-rules';

assert.equal(
  formatActivityScopes({
    scope_names: '[{"type":"department","name":"学生会"},{"type":"department","name":"组织部"}]',
  }),
  '主办单位：学生会；联办单位：组织部',
);

assert.equal(
  formatActivityScopes({
    scope_type: 'department',
    scope_name: '学生会',
  }),
  '主办单位：学生会',
);

assert.equal(
  formatActivityScopes({
    scope_names: [
      { type: 'department', name: '学生会' },
      { type: 'department', name: '组织部' },
      { type: 'department', name: '宣传部' },
    ],
  }),
  '主办单位：学生会；联办单位：组织部、宣传部',
);

assert.equal(
  formatActivityScopes({
    scope_names: '[{"type":"class","name":"软件工程1班"},{"type":"class","name":"软件工程2班"}]',
  }),
  '主办单位：软件工程1班；联办单位：软件工程2班',
);

assert.equal(
  formatActivityScopes({
    scope_type: 'class',
    scope_name: '软件工程1班',
  }),
  '主办单位：软件工程1班',
);

assert.equal(formatActivityScopes({}), '-');

assert.deepEqual(normalizeIds(' [\"leader-1\", \"leader-1\", \" leader-2 \"] '), ['leader-1', 'leader-2']);
assert.equal(serializeIds(normalizeIds(' [\"leader-1\", \"leader-1\", \" leader-2 \"] ')), '[\"leader-1\",\"leader-2\"]');
assert.equal(serializeIds(['leader-1', 'leader-1', '']), '[\"leader-1\"]');

console.log('business rules scope format tests passed');
