/**
 * Keeps a student ID that OCR actually read. Roster lookup is a best-effort
 * enrichment step and may not find abbreviated class names such as 虚拟2531.
 */
export function selectStudentIdAfterRosterLookup(ocrStudentId: string, candidates: string[]): string {
  const recognizedId = ocrStudentId.trim();
  if (recognizedId) return recognizedId;
  return candidates.length === 1 ? candidates[0] : '';
}
