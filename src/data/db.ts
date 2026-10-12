// Encrypted database bootstrap — op-sqlite with SQLCipher. The random DB key is
// generated once and kept in the Android Keystore via expo-secure-store (§10).
import { open } from '@op-engineering/op-sqlite';
import { drizzle } from 'drizzle-orm/op-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { deleteAllImages } from './files';
import { migrate } from './migrations';

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

let _db: Promise<ReturnType<typeof drizzle>> | null = null;

// Cached as a promise so concurrent first calls share one open + migration.
export function getDb() {
  if (!_db) {
    _db = (async () => {
      const encryptionKey = await getOrCreateKey();
      // encryptionKey only takes effect because package.json sets "op-sqlite": { "sqlcipher": true }.
      const conn = open({ name: DB_NAME, encryptionKey });
      await migrate(conn);
      return drizzle(conn);
    })().catch((e) => {
      _db = null;
      throw e;
    });
  }
  return _db;
}

// Called from Settings → "Delete all data" (§10): wipe DB file, document images + key.
export async function deleteEverything() {
  _db = null;
  const conn = open({ name: DB_NAME });
  conn.delete();
  await deleteAllImages();
  await SecureStore.deleteItemAsync(KEY_ALIAS);
}
