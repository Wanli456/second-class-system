import assert from 'node:assert/strict';
import { uniqueLookup } from './unique-lookup';

const lookup = uniqueLookup([
  { id: '1', name: '张三' },
  { id: '2', name: '李四' },
  { id: '3', name: '张三' },
  { id: '4', name: '' },
], (value) => value.name);

assert.equal(lookup.get('李四')?.id, '2');
assert.equal(lookup.has('张三'), false, '同名人员不能通过姓名唯一匹配');
assert.equal(lookup.has(''), false, '空标识不能参与匹配');

console.log('unique lookup tests passed');
