import assert from 'node:assert/strict';
import { formatActivityScopes } from './business-rules';

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

assert.equal(formatActivityScopes({}), '-');

console.log('business rules scope format tests passed');
