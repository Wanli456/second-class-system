import { query } from '@/storage/database/supabase-client';
import { hammingDistance, imageSimilarityPercent, type ImageHash } from '@/lib/image-hash';

const DUPLICATE_DISTANCE_THRESHOLD = 10; // 64-bit dHash 汉明距离 <= 10，约 84% 以上相似。

type ExistingHashRow = {
  id: string;
  applicant_name: string | null;
  applicant_student_id: string | null;
  created_at: string | null;
  image_hashes: string | null;
};

export type DuplicateCheckResult = {
  found: boolean;
  duplicate_of_slip_id?: string;
  score?: number;
  warning?: string;
};

export async function detectDuplicateSlip(slipId: string, newHashes: ImageHash[]): Promise<DuplicateCheckResult> {
  if (!newHashes.length) return { found: false };
  const rows = await query<ExistingHashRow>(
    `SELECT id, applicant_name, applicant_student_id, created_at, image_hashes
     FROM leave_slips
     WHERE id <> $1 AND image_hashes IS NOT NULL AND image_hashes <> '[]'
     ORDER BY created_at DESC
     LIMIT 1000`,
    [slipId],
  );

  let best: { slipId: string; score: number; oldUrl: string; newUrl: string; applicant: string } | null = null;

  for (const row of rows) {
    const oldHashes = parseHashes(row.image_hashes);
    for (const current of newHashes) {
      if (!current.dhash) continue;
      for (const old of oldHashes) {
        const distance = hammingDistance(current.dhash, old.dhash);
        if (distance <= DUPLICATE_DISTANCE_THRESHOLD) {
          const score = imageSimilarityPercent(current.dhash, old.dhash);
          if (!best || score > best.score) {
            best = {
              slipId: row.id,
              score,
              oldUrl: old.url,
              newUrl: current.url,
              applicant: `${row.applicant_name || '未知'}（${row.applicant_student_id || '无学号'}）`,
            };
          }
        }
      }
    }
  }

  if (!best) return { found: false };

  const warning = `疑似重复使用他人假条图片：与 ${best.applicant} 的历史假条图片相似度 ${best.score}%`;
  await query(
    `UPDATE leave_slips
     SET duplicate_of_slip_id=$1,
         duplicate_score=$2,
         duplicate_warning=$3,
         updated_at=NOW()
     WHERE id=$4`,
    [best.slipId, best.score, warning, slipId],
  );

  return { found: true, duplicate_of_slip_id: best.slipId, score: best.score, warning };
}

function parseHashes(value: string | null): Array<{ url: string; dhash: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const url = String((item as { url?: unknown }).url || '');
      const dhash = String((item as { dhash?: unknown }).dhash || '');
      if (!url || !dhash) return [];
      return [{ url, dhash }];
    });
  } catch {
    return [];
  }
}
