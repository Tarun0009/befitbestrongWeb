function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null) return false;
  if (typeof left !== "object" || typeof right !== "object") return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildChangedFields<T extends object>(
  current: T,
  original: T,
): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(current) as Array<keyof T>) {
    if (!valuesEqual(current[key], original[key])) {
      Object.assign(patch, { [key]: current[key] });
    }
  }
  return patch;
}

export function hasChangedFields(value: object): boolean {
  return Object.keys(value).length > 0;
}
