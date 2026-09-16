export interface ScoringMaterialState {
  level: string;
  scope_type?: string | null;
  scoring_table_url?: string | null;
  record_photo_url?: string | null;
}

export function hasRequiredScoringMaterials(activity: ScoringMaterialState): boolean {
  if (!activity.scoring_table_url) return false;
  if (activity.scope_type === 'other_college') return true;
  return activity.level !== '校级' || Boolean(activity.record_photo_url);
}
