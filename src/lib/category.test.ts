import assert from 'node:assert/strict';
import { CATEGORY_DETAILS, CATEGORIES, formatCategoryPath, isValidCategoryPath } from './types';

for (const category of CATEGORIES) {
  assert.ok(Object.keys(CATEGORY_DETAILS[category]).length > 0, `${category} should have primary categories`);
  for (const secondary of Object.values(CATEGORY_DETAILS[category])) {
    assert.ok(secondary.length > 0, `${category} should have secondary categories`);
  }
}

assert.equal(formatCategoryPath('德', '思想政治', '主题学习'), '德 / 思想政治 / 主题学习');
assert.equal(formatCategoryPath('智'), '智');
assert.equal(isValidCategoryPath('德', '思想政治', '主题学习'), true);
assert.equal(isValidCategoryPath('德', '思想政治', '个人发展规划'), false);
console.log('category hierarchy tests passed');
