export interface ScoringMaterialState {
  level: string;
  scoring_table_url?: string | null;
  record_photo_url?: string | null;
}

export function hasRequiredScoringMaterials(activity: ScoringMaterialState): boolean {
  if (!activity.scoring_table_url) return false;
  return activity.level !== '校级' || Boolean(activity.record_photo_url);
}
