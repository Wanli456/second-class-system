export type ActivityDeletionAction = 'delete' | 'cancel';

export function getActivityDeletionAction(referenceCount: number): ActivityDeletionAction {
  return referenceCount > 0 ? 'cancel' : 'delete';
}
