/**
 * Returns only keys that identify exactly one record. Names can be duplicated
 * and therefore must not silently select an arbitrary student.
 */
export function uniqueLookup<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Map<string, T> {
  const matches = new Map<string, T>();
  const duplicateKeys = new Set<string>();

  for (const value of values) {
    const key = keyFor(value);
    if (!key || duplicateKeys.has(key)) continue;
    if (matches.has(key)) {
      matches.delete(key);
      duplicateKeys.add(key);
      continue;
    }
    matches.set(key, value);
  }

  return matches;
}
