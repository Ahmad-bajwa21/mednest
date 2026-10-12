// Encrypted database bootstrap — op-sqlite with SQLCipher. The random DB key is
// generated once and kept in the Android Keystore via expo-secure-store (§10).
import { open } from '@op-engineering/op-sqlite';
import { drizzle } from 'drizzle-orm/op-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DB_NAME = 'mednest.db';
const KEY_ALIAS = 'mednest.db.key';

async function getOrCreateKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(KEY_ALIAS);
  if (!key) {
    // 32 random bytes -> hex. Never derived from anything guessable.
    const bytes = Crypto.getRandomBytes(32);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_ALIAS, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return key;
}

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (_db) return _db;
  const encryptionKey = await getOrCreateKey();
  const conn = open({ name: DB_NAME, encryptionKey });
  _db = drizzle(conn);
  return _db;
}

// Called from Settings → "Delete all data" (§10): wipe DB file + key.
export async function deleteEverything() {
  _db = null;
  const conn = open({ name: DB_NAME });
  conn.delete();
  await SecureStore.deleteItemAsync(KEY_ALIAS);
}
