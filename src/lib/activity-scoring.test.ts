import assert from 'node:assert/strict';
import { CATEGORY_COLORS } from './types';
import { hasRequiredScoringMaterials } from './activity-scoring';

assert.equal(hasRequiredScoringMaterials({ level: '院系级', scoring_table_url: 'table.xlsx', record_photo_url: null }), true);
assert.equal(hasRequiredScoringMaterials({ level: '校级', scoring_table_url: 'table.xlsx', record_photo_url: null }), false);
assert.equal(hasRequiredScoringMaterials({ level: '校级', scoring_table_url: 'table.xlsx', record_photo_url: 'photo.jpg' }), true);
assert.notEqual(CATEGORY_COLORS['德'], CATEGORY_COLORS['智']);
assert.notEqual(CATEGORY_COLORS['智'], CATEGORY_COLORS['体']);
console.log('activity scoring rule tests passed');
