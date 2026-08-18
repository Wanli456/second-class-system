import { CATEGORY_COLORS, formatCategoryPathWithMissing } from '@/lib/types';
import { cn } from '@/lib/utils';

export function CategoryBadge({ category, primary, secondary, topLevelOnly = false, className }: {
  category: string;
  primary?: string | null;
  secondary?: string | null;
  topLevelOnly?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(
      'inline-flex max-w-full rounded border px-1.5 py-0.5 text-xs font-medium leading-5',
      CATEGORY_COLORS[category] || 'border-gray-200 bg-gray-50 text-gray-700',
      className,
    )}>
      {topLevelOnly ? category : formatCategoryPathWithMissing(category, primary, secondary)}
    </span>
  );
}
