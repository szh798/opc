export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function readJsonObject<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return cloneJson(value as T);
  }

  return cloneJson(fallback);
}

export function readJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (Array.isArray(value)) {
    return cloneJson(value as T[]);
  }

  return cloneJson(fallback);
}
