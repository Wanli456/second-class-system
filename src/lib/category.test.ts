import assert from 'node:assert/strict';
import { CATEGORY_DETAILS, CATEGORIES, formatCategoryPath, formatCategoryPathWithMissing, isValidCategoryPath } from './types';

for (const category of CATEGORIES) {
  assert.ok(Object.keys(CATEGORY_DETAILS[category]).length > 0, `${category} should have primary categories`);
  for (const secondary of Object.values(CATEGORY_DETAILS[category])) {
    assert.ok(secondary.length > 0, `${category} should have secondary categories`);
  }
}

assert.equal(formatCategoryPath('德', '思想政治', '主题学习'), '德 / 思想政治 / 主题学习');
assert.equal(formatCategoryPath('智'), '智');
assert.equal(formatCategoryPathWithMissing('美'), '美 / 一级分类未记录 / 二级分类未记录');
assert.equal(formatCategoryPathWithMissing('美', '艺术审美'), '美 / 艺术审美 / 二级分类未记录');
const expectedCategories = {
  德: {
    思想政治: ['团组织生活', '“青”字号思政活动', '主题学习活动', '理论应用知识竞答', '先进荣誉', '宣传思想'],
    公民道德: ['道德担当', '道德实践', '校园文明', '诚实守信'],
    公民道德扣分项: ['遵纪守法行为规范'],
    社会责任: ['任职经历', '任职荣誉', '能力提升培训', '团队志愿服务', '志愿服务获奖', '公益服务', '无偿献血', '西部计划志愿者项目', '志愿服务违规行为', '军训教育'],
  },
  智: {
    科学精神: ['图书借阅'],
    工匠精神: ['实习实训', '论文发表', '学术研究', '技能提升证书', '专利申请', '协助参与技能竞赛', '专业技能竞赛'],
    创新精神: ['SYB培训', '创新创业', '入驻创新创业俱乐部', '创新创业比赛'],
  },
  体: {
    身心健康: ['心理健康', '体育素养', '疾病预防', '体育赛事裁判', '体育赛事活动获奖', '校园体育赛事活动'],
    体育活动: ['健康校园活动'],
  },
  美: {
    艺术审美: ['人文修养', '文化艺术参赛', '文化艺术表演', '文化艺术主持', '文化艺术竞赛获奖', '校园文化艺术活动'],
    美育活动: ['美育活动'],
    文化艺术活动扣分项: ['文化艺术活动违规'],
  },
  劳: {
    劳动精神: ['实践活动', '团队实践', '兼职活动', '勤工助学', '假期个人实践', '社会调研', '劳动锻炼', '宿舍劳动'],
    劳育活动: ['劳育活动'],
    自我管理: ['个人发展规划'],
  },
};

assert.deepEqual(CATEGORY_DETAILS, expectedCategories, '分类必须与本次细则图片逐项一致');
for (const [category, primaries] of Object.entries(expectedCategories)) {
  for (const [primary, secondaries] of Object.entries(primaries)) {
    for (const secondary of secondaries) {
      assert.equal(isValidCategoryPath(category, primary, secondary), true, `${category}/${primary}/${secondary}`);
    }
  }
}
assert.equal(isValidCategoryPath('德', '思想政治', '主题学习'), false);
assert.equal(isValidCategoryPath('德', '公民道德', '公民道德扣分项'), false);
assert.equal(isValidCategoryPath('美', '艺术审美', '文化艺术活动违规'), false);
assert.equal(isValidCategoryPath('德', '思想政治', '个人发展规划'), false);
console.log('category hierarchy tests passed');
