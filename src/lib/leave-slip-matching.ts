import { query, queryOne } from '@/storage/database/supabase-client';
import {
  compareImageFingerprints,
  parseStoredImageFingerprints,
  type ImageConsistencyResult,
} from '@/lib/original-image-consistency';

function parseNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return parseNames(parsed);
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

interface SlipRow {
  id: string;
  slip_type: string;
  activity_id?: string | null;
  class_names: string | null;
  ocr_names?: string | null;
  image_hashes?: string | null;
  original_slip_id?: string | null;
}
interface OriginalRow {
  id: string;
  activity_id?: string | null;
  activity_name?: string | null;
  student_names?: string | null;
  ocr_names?: string | null;
  image_hashes?: string | null;
}

export type AutoMatchResult = {
  action: 'rejected' | 'manual' | 'skipped';
  missing: string[];
  matched: string[];
  image_consistency?: ImageConsistencyResult;
};

export async function compareSlipWithOriginals(slipId: string): Promise<AutoMatchResult> {
  const slip = await queryOne<SlipRow>('SELECT * FROM leave_slips WHERE id=$1', [slipId]);
  if (!slip) return { action: 'skipped', missing: [], matched: [] };
  // 外院/非本学院举办的校级活动、手机假条和其他请假，都没有系统活动记录或原假条可比，跳过自动名单比对。
  if (slip.slip_type === '校级（且不为数经举办）假条' || slip.slip_type === '手机假条' || slip.slip_type === '其他请假') return { action: 'skipped', missing: [], matched: [] };

  const studentRows = await query<{ student_name: string }>(
    'SELECT student_name FROM leave_slip_students WHERE slip_id=$1',
    [slipId],
  );
  const uploadNames = unique([...parseNames(slip.ocr_names), ...studentRows.map((row) => row.student_name.trim()).filter(Boolean)]);
  const originals = await query<OriginalRow>('SELECT * FROM original_leave_slips');
  if (!originals.length) return { action: 'skipped', missing: [], matched: [] };

  let candidates = originals;
  if (slip.activity_id) {
    // 先按活动ID锁定原假条，避免不同活动名单同名/交叉时选错。
    const byActivity = originals.filter((original) => original.activity_id === slip.activity_id);
    if (byActivity.length > 0) {
      candidates = byActivity;
    } else {
      // 没有该活动的原假条时，不要回退到全表猜测，否则容易跨活动误匹配后自动驳回。
      return { action: 'skipped', missing: [], matched: [] };
    }
  }

  let best: OriginalRow | null = slip.original_slip_id
    ? candidates.find((original) => original.id === slip.original_slip_id) || null
    : null;

  if (!best) {
    const scored = candidates.map((original) => {
      const originalNames = unique([...parseNames(original.student_names), ...parseNames(original.ocr_names)]);
      const overlap = uploadNames.filter((name) => originalNames.includes(name)).length;
      return { original, overlap };
    }).filter((entry) => entry.overlap > 0).sort((left, right) => right.overlap - left.overlap);
    best = scored[0]?.original || null;
  }

  const originalNames = best
    ? unique([...parseNames(best.student_names), ...parseNames(best.ocr_names)])
    : [];

  const matched = uploadNames.filter((name) => originalNames.includes(name));
  const missing = uploadNames.filter((name) => !originalNames.includes(name));

  if (missing.length > 0) {
    // 只有二课活动请假会要求与原假条名单完全一致；手写假条没有匹配原假条时不能自动驳回。
    if (slip.slip_type === '二课活动请假' && best) {
      await query(
        `UPDATE leave_slips
         SET review_status='已驳回',
             review_note=$1,
             original_slip_id=$2,
             updated_at=NOW()
         WHERE id=$3`,
        [`自动识别到原假条中没有的同学：${missing.join('、')}，已自动驳回`, best.id, slipId],
      );
      return { action: 'rejected', missing, matched };
    }
    // 手写假条等：列为缺失，但保持待查对，交给人工判断。
    if (best) {
      await query(
        `UPDATE leave_slips
         SET review_status='待查对',
             review_note=$1,
             original_slip_id=$2,
             updated_at=NOW()
         WHERE id=$3`,
        [`自动比对与原假条有 ${missing.length} 名同学不一致，待查对人员人工确认`, best.id, slipId],
      );
      return { action: 'manual', missing, matched };
    }
    return { action: 'skipped', missing, matched: [] };
  }

  if (matched.length === 0) return { action: 'skipped', missing: [], matched: [] };

  let imageConsistency: ImageConsistencyResult | undefined;
  if (slip.slip_type === '二课活动请假' && best) {
    imageConsistency = compareImageFingerprints(
      parseStoredImageFingerprints(slip.image_hashes),
      parseStoredImageFingerprints(best.image_hashes),
    );
    await query(
      `UPDATE leave_slips
       SET original_image_similarity=$1,
           original_image_difference_warning=$2,
           updated_at=NOW()
       WHERE id=$3`,
      [imageConsistency.similarity, imageConsistency.warning, slipId],
    );
  }

  await query(
    `UPDATE leave_slips
     SET review_status='待查对',
         review_note='文字名单与原假条一致，待考勤组长人工核对照片',
         original_slip_id=$1,
         updated_at=NOW()
     WHERE id=$2`,
    [best!.id, slipId],
  );
  return { action: 'manual', missing: [], matched, image_consistency: imageConsistency };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(stripClassSuffix).map((item) => item.trim()).filter(Boolean))];
}

function stripClassSuffix(value: string): string {
  // 原假条中姓名可能存成“刘玉(应化2532)”，匹配时只比较姓名本身。
  return value.replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '').trim();
}
