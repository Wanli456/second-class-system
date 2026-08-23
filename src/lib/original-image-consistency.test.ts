import assert from 'node:assert/strict';
import {
  compareImageFingerprints,
  type ImageFingerprint,
} from '@/lib/original-image-consistency';

function fingerprint(url: string, sha256: string, dhash: string): ImageFingerprint {
  return { url, sha256, dhash };
}

function run() {
  const original = fingerprint('/uploads/original.png', 'same-sha', '0000000000000000');

  const exact = compareImageFingerprints(
    [fingerprint('/uploads/submitted.png', 'same-sha', '0000000000000000')],
    [original],
  );
  assert.equal(exact.status, 'consistent');
  assert.equal(exact.similarity, 100);
  assert.equal(exact.warning, null);

  const compressed = compareImageFingerprints(
    [fingerprint('/uploads/submitted.jpg', 'different-sha', '00000000000000ff')],
    [original],
  );
  assert.equal(compressed.status, 'consistent');
  assert.equal(compressed.similarity, 88);
  assert.equal(compressed.warning, null);

  const needsReview = compareImageFingerprints(
    [fingerprint('/uploads/cropped.jpg', 'different-sha', '0000000000000fff')],
    [original],
  );
  assert.equal(needsReview.status, 'review');
  assert.equal(needsReview.similarity, 81);
  assert.match(needsReview.warning || '', /图片差异/);

  const obviousDifference = compareImageFingerprints(
    [fingerprint('/uploads/edited.png', 'different-sha', 'ffffffffffffffff')],
    [original],
  );
  assert.equal(obviousDifference.status, 'risk');
  assert.equal(obviousDifference.similarity, 0);

  const noFingerprint = compareImageFingerprints(
    [fingerprint('/uploads/submitted.png', '', '')],
    [],
  );
  assert.equal(noFingerprint.status, 'unavailable');
  assert.equal(noFingerprint.warning, null);

  const multipleImages = compareImageFingerprints(
    [
      fingerprint('/uploads/submitted-1.png', 'different-1', '0000000000000000'),
      fingerprint('/uploads/submitted-2.png', 'different-2', 'ffffffffffffffff'),
    ],
    [original],
  );
  assert.equal(multipleImages.status, 'risk');
  assert.equal(multipleImages.similarity, 0);

  console.log('original image consistency tests passed');
}

run();



