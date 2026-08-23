import { imageSimilarityPercent } from '@/lib/image-hash';

const CONSISTENT_DISTANCE_THRESHOLD = 10;
const REVIEW_DISTANCE_THRESHOLD = 20;

export type ImageFingerprint = {
  url: string;
  sha256?: string;
  dhash?: string;
};

export type ImageConsistencyResult = {
  status: 'consistent' | 'review' | 'risk' | 'unavailable';
  similarity: number | null;
  warning: string | null;
};

export function compareImageFingerprints(
  submitted: ImageFingerprint[],
  originals: ImageFingerprint[],
): ImageConsistencyResult {
  const validSubmitted = submitted.filter(hasComparableFingerprint);
  const validOriginals = originals.filter(hasComparableFingerprint);
  if (!validSubmitted.length || !validOriginals.length) {
    return { status: 'unavailable', similarity: null, warning: null };
  }

  let lowestBestSimilarity = 100;
  for (const submittedImage of validSubmitted) {
    let bestSimilarity = 0;
    for (const originalImage of validOriginals) {
      if (submittedImage.sha256 && originalImage.sha256 && submittedImage.sha256 === originalImage.sha256) {
        bestSimilarity = 100;
        continue;
      }
      if (!submittedImage.dhash || !originalImage.dhash) continue;
      bestSimilarity = Math.max(bestSimilarity, imageSimilarityPercent(submittedImage.dhash, originalImage.dhash));
    }
    lowestBestSimilarity = Math.min(lowestBestSimilarity, bestSimilarity);
  }

  if (lowestBestSimilarity >= similarityForDistance(CONSISTENT_DISTANCE_THRESHOLD)) {
    return { status: 'consistent', similarity: lowestBestSimilarity, warning: null };
  }

  if (lowestBestSimilarity >= similarityForDistance(REVIEW_DISTANCE_THRESHOLD)) {
    return {
      status: 'review',
      similarity: lowestBestSimilarity,
      warning: `提交图片与原始活动假条存在图片差异（最低匹配相似度 ${lowestBestSimilarity}%），请人工核对公章、签字、日期和正文区域。`,
    };
  }

  return {
    status: 'risk',
    similarity: lowestBestSimilarity,
    warning: `提交图片与原始活动假条存在明显图片差异（最低匹配相似度 ${lowestBestSimilarity}%），请人工核对公章、签字、日期和正文区域。`,
  };
}
function hasComparableFingerprint(image: ImageFingerprint): boolean {
  return Boolean(image.sha256 || image.dhash);
}

function similarityForDistance(distance: number): number {
  return Math.round(100 - (distance / 64) * 100);
}

export function parseImageFingerprints(value: unknown): ImageFingerprint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { url?: unknown; sha256?: unknown; dhash?: unknown };
    const url = String(candidate.url || '').trim();
    const sha256 = String(candidate.sha256 || '').trim();
    const dhash = String(candidate.dhash || '').trim();
    if (!url || (!sha256 && !dhash)) return [];
    return [{ url, sha256: sha256 || undefined, dhash: dhash || undefined }];
  });
}

export function parseStoredImageFingerprints(value: string | null | undefined): ImageFingerprint[] {
  if (!value) return [];
  try {
    return parseImageFingerprints(JSON.parse(value));
  } catch {
    return [];
  }
}

