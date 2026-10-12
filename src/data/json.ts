// Helpers for list fields stored as JSON text (times, imagePaths, sourceDocumentIds).
export function jsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function toJson(arr: readonly string[] | null | undefined): string {
  return JSON.stringify(arr ?? []);
}
