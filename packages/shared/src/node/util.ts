/** Shortens text to `max` characters (with an ellipsis). null/undefined stay null. */
export function truncate(value: unknown, max = 300): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
