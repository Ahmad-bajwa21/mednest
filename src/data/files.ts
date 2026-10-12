// Document image files in app-private storage (spec §10). Originals are kept for the
// life of the document and removed with it.
// TODO(security, spec §10): encrypt these at rest with AES-256-GCM (key in Keystore).
import * as FileSystem from 'expo-file-system';

export const DOCS_DIR = `${FileSystem.documentDirectory ?? ''}documents/`;

export async function deleteImages(paths: string[]): Promise<void> {
  for (const p of paths) await FileSystem.deleteAsync(p, { idempotent: true }).catch(() => undefined);
}

export async function deleteAllImages(): Promise<void> {
  await FileSystem.deleteAsync(DOCS_DIR, { idempotent: true }).catch(() => undefined);
}
