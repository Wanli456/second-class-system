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

interface SubmittedStudentRow {
  slip_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
}

interface LinkedSlipRow {
  id: string;
  ocr_names?: string | null;
  review_status: string;
}

type GroupCheck = {
  originalCount: number;
  submittedCount: number;
  missingBySlip: Map<string, string[]>;
  duplicateBySlip: Map<string, string[]>;
  overCapacityNames: string[];
  exceedsOriginalCount: boolean;
};

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

  const studentRows = await query<SubmittedStudentRow>(
    'SELECT slip_id, student_id, student_name, class_name FROM leave_slip_students WHERE slip_id=$1',
    [slipId],
  );
  // 人工确认的学生表优先于 OCR；OCR 仅在尚未形成学生表时作为临时比对名单。
  const uploadNames = studentRows.length
    ? studentRows.map((row) => normalizeName(row.student_name)).filter(Boolean)
    : parseNames(slip.ocr_names).map(normalizeName).filter(Boolean);
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
      const originalNames = originalMemberNames(original);
      const overlap = uploadNames.filter((name) => originalNames.includes(name)).length;
      return { original, overlap };
    }).filter((entry) => entry.overlap > 0).sort((left, right) => right.overlap - left.overlap);
    best = scored[0]?.original || null;

    // 同一活动只有一张归档原假条时，多个班级负责人可分别上传本班假条。
    // 即使该班学生尚未被 OCR 完整识别，也先关联唯一候选，交由查对人员核实，
    // 而不是因为没有姓名重叠而遗漏整张班级假条。
    if (!best && candidates.length === 1 && slip.activity_id) best = candidates[0];
  }

  if (!best) return { action: 'skipped', missing: [], matched: [] };

  // 关联只用于把同一活动的多张班级假条放进同一个人工核对组，绝不代表自动通过。
  // 后续按原假条名单逐人校验：学生必须在原名单中、跨班不得重复，且去重总人数不能超过原名单人数。
  await query(
    `UPDATE leave_slips
     SET original_slip_id=$1, review_status='待查对', updated_at=NOW()
     WHERE id=$2`,
    [best.id, slipId],
  );

  const groupCheck = await checkOriginalGroup(best);
  const missing = groupCheck.missingBySlip.get(slipId) || [];
  const duplicates = groupCheck.duplicateBySlip.get(slipId) || [];
  const originalNames = originalMemberNames(best);
  const matched = uploadNames.filter((name) => originalNames.includes(name));

  let imageConsistency: ImageConsistencyResult | undefined;
  if (slip.slip_type === '二课活动请假') {
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

  const problems: string[] = [];
  if (groupCheck.originalCount === 0) problems.push('原假条尚未识别到可核验的学生名单，请先补全原假条名单');
  if (missing.length) problems.push(`原假条中未找到：${missing.join('、')}`);
  if (duplicates.length) problems.push(`与其他班级负责人重复提交：${duplicates.join('、')}`);
  if (groupCheck.exceedsOriginalCount) problems.push(`各班已提交学生按学号去重后共 ${groupCheck.submittedCount} 人，超过原假条 ${groupCheck.originalCount} 人`);
  if (groupCheck.overCapacityNames.length) problems.push(`原名单同名人数不足：${groupCheck.overCapacityNames.join('、')}`);

  const reviewNote = problems.length
    ? `待查对：原假条共 ${groupCheck.originalCount} 人，当前各班已提交学生按学号去重共 ${groupCheck.submittedCount} 人；${problems.join('；')}。请人工核对后决定是否驳回。`
    : `名单校验通过：原假条共 ${groupCheck.originalCount} 人，当前各班已提交学生按学号去重共 ${groupCheck.submittedCount} 人；仍待考勤组长人工核对照片。`;
  await query(
    `UPDATE leave_slips
     SET review_status='待查对', review_note=$1, updated_at=NOW()
     WHERE id=$2`,
    [reviewNote, slipId],
  );
  return { action: 'manual', missing, matched, image_consistency: imageConsistency };
}

async function checkOriginalGroup(original: OriginalRow): Promise<GroupCheck> {
  const linkedSlips = await query<LinkedSlipRow>(
    `SELECT id, ocr_names, review_status FROM leave_slips
     WHERE original_slip_id=$1 AND review_status <> '已驳回'`,
    [original.id],
  );
  const linkedIds = linkedSlips.map((slip) => slip.id);
  const students = linkedIds.length
    ? await query<SubmittedStudentRow>(
      `SELECT slip_id, student_id, student_name, class_name FROM leave_slip_students
       WHERE slip_id IN (${linkedIds.map((_, index) => `$${index + 1}`).join(',')})`,
      linkedIds,
    )
    : [];
  const membersBySlip = new Map<string, SubmittedStudentRow[]>();
  for (const row of students) membersBySlip.set(row.slip_id, [...(membersBySlip.get(row.slip_id) || []), row]);

  const originalNames = originalMemberNames(original);
  const originalCapacity = countBy(originalNames);
  const allMembers: Array<{ slipId: string; identity: string; name: string }> = [];
  for (const slip of linkedSlips) {
    const manualRows = membersBySlip.get(slip.id) || [];
    const members = manualRows.length
      ? manualRows.map((row) => ({ identity: studentIdentity(row.student_id, row.student_name, row.class_name), name: normalizeName(row.student_name) }))
      : parseNames(slip.ocr_names).map((name) => ({ identity: `ocr:${normalizeName(name)}`, name: normalizeName(name) }));
    for (const member of members) if (member.name) allMembers.push({ slipId: slip.id, ...member });
  }

  const identities = new Map<string, Array<{ slipId: string; name: string }>>();
  for (const member of allMembers) identities.set(member.identity, [...(identities.get(member.identity) || []), member]);
  const duplicateBySlip = new Map<string, string[]>();
  for (const entries of identities.values()) {
    if (entries.length < 2) continue;
    for (const entry of entries) duplicateBySlip.set(entry.slipId, [...(duplicateBySlip.get(entry.slipId) || []), entry.name]);
  }

  const uniqueMembers = [...identities.values()].map((entries) => entries[0]);
  const submittedByName = countBy(uniqueMembers.map((member) => member.name));
  const overCapacityNames = [...submittedByName.entries()]
    .filter(([name, count]) => count > (originalCapacity.get(name) || 0))
    .map(([name]) => name);
  const missingBySlip = new Map<string, string[]>();
  for (const member of allMembers) {
    if (!originalCapacity.has(member.name)) missingBySlip.set(member.slipId, [...(missingBySlip.get(member.slipId) || []), member.name]);
  }

  return {
    originalCount: originalNames.length,
    submittedCount: uniqueMembers.length,
    missingBySlip,
    duplicateBySlip,
    overCapacityNames,
    exceedsOriginalCount: uniqueMembers.length > originalNames.length,
  };
}

function originalMemberNames(original: OriginalRow): string[] {
  // 原假条人工确认名单通常按“学号｜姓名｜班级”保存；旧数据和 OCR 名单可能只有姓名。
  // 这里保留重复姓名，避免把 5 人误算成 4 人。
  const names = parseNames(original.student_names);
  return (names.length ? names : parseNames(original.ocr_names))
    .map((value) => {
      const parts = value.split(/[｜|]/).map((part) => part.trim());
      return parts.length >= 3 ? parts[1] : value;
    })
    .map(normalizeName)
    .filter(Boolean);
}

function countBy(values: string[]): Map<string, number> {
  return values.reduce((counts, value) => counts.set(value, (counts.get(value) || 0) + 1), new Map<string, number>());
}

function studentIdentity(studentId: string, name: string, className: string): string {
  const normalizedId = studentId.trim();
  return normalizedId ? `id:${normalizedId}` : `name-class:${normalizeName(name)}|${className.trim()}`;
}

function normalizeName(value: string): string {
  return stripClassSuffix(value).replace(/\s+/g, '').trim();
}

function stripClassSuffix(value: string): string {
  // 原假条中姓名可能存成“刘玉(应化2532)”，匹配时只比较姓名本身。
  return value.replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '').trim();
}
