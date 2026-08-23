import assert from 'node:assert/strict';
import { OTHER_COLLEGES, createOtherCollegeActivityId, isOtherCollege } from './other-college-registration';

assert.equal(OTHER_COLLEGES.length, 4);
assert.equal(isOtherCollege('智能制造学院'), true);
assert.equal(isOtherCollege('机械工程学院'), true);
assert.equal(isOtherCollege('药品与环境工程学院'), true);
assert.equal(isOtherCollege('应用化工学院'), true);
assert.equal(isOtherCollege('第二课堂认证中心'), false);
assert.match(createOtherCollegeActivityId(new Date('2026-08-23T00:00:00Z'), 0), /^OC202608[0-9a-z]{6}$/);

console.log('other-college-registration tests passed');
