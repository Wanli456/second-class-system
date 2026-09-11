import assert from 'node:assert/strict';
import {
  CONTACT_PHONE_MAX_LENGTH,
  normalizeContactPhone,
  validateContactPhoneInput,
} from './contact-phone';

// 归一化：去掉首尾空白、把连续的空白折叠成单个空格
assert.equal(normalizeContactPhone('  138 0000 0000  '), '138 0000 0000');
assert.equal(normalizeContactPhone('   '), null);
assert.equal(normalizeContactPhone(null), null);
assert.equal(normalizeContactPhone(12345), null);

// 空值允许（是否必填由调用方按角色判断）
assert.deepEqual(validateContactPhoneInput(''), { ok: true, value: null });
assert.deepEqual(validateContactPhoneInput('   '), { ok: true, value: null });

// 手机号与微信号都可以通过
assert.deepEqual(validateContactPhoneInput('13800000000'), { ok: true, value: '13800000000' });
assert.deepEqual(validateContactPhoneInput('+86 138-0000-0000'), { ok: true, value: '+86 138-0000-0000' });
assert.deepEqual(validateContactPhoneInput('zhangsan_wx'), { ok: true, value: 'zhangsan_wx' });

// 太短、太长、含非法字符、只有符号都要拒绝
assert.equal(validateContactPhoneInput('1234').ok, false);
assert.equal(validateContactPhoneInput('x'.repeat(CONTACT_PHONE_MAX_LENGTH + 1)).ok, false);
assert.equal(validateContactPhoneInput('13800000000@qq.com').ok, false);
assert.equal(validateContactPhoneInput('+++---').ok, false);
assert.equal(validateContactPhoneInput('张三').ok, false);

console.log('contact phone validation tests passed');