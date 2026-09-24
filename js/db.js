// Tiny promise wrapper around IndexedDB. Everything the app stores lives here,
// on the device — nothing is sent to a server.

const DB_NAME = 'lifelog';
const VERSION = 1;

export const STORES = {
  entries: ['kind', 'date'],   // diary, moment, story, idea, quote, journey, activity, review
  media: [],                   // photo blobs referenced by entries
  schedule: [],                // weekly planner blocks
  checks: ['date'],            // schedule block done-marks per day
  learning: [],                // 12-week learning plan
  career: ['type'],            // applications, certs, projects, wins, skills
  money: ['date'],             // income / expense transactions
  accounts: [],                // bank / card / cash accounts
  vault: [],                   // encrypted documents & cards (metadata + ciphertext)
  vaultfiles: [],              // encrypted file bytes for vault items
  days: [],                    // per-day mood / highlight (keyPath: date)
  settings: [],                // key/value (keyPath: key)
  deleted: [],                 // tombstones so deletes survive backup merges
};

const KEYPATH = { days: 'date', settings: 'key' };

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, indexes] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const os = db.createObjectStore(name, { keyPath: KEYPATH[name] || 'id' });
        for (const ix of indexes) os.createIndex(ix, ix);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode = 'readonly') {
  const db = await open();
  return db.transaction(store, mode).objectStore(store);
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(store) { for (const fn of listeners) fn(store); }

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const db = {
  async get(store, id) { return wrap((await tx(store)).get(id)); },
  async all(store) { return wrap((await tx(store)).getAll()); },
  async byIndex(store, index, value) { return wrap((await tx(store)).index(index).getAll(value)); },
  async range(store, index, lo, hi) {
    return wrap((await tx(store)).index(index).getAll(IDBKeyRange.bound(lo, hi)));
  },
  async put(store, obj, { silent = false, keepTime = false } = {}) {
    const now = Date.now();
    if (!KEYPATH[store] && !obj.id) obj.id = uid();
    if (!obj.createdAt) obj.createdAt = now;
    if (!keepTime) obj.updatedAt = now;
    await wrap((await tx(store, 'readwrite')).put(obj));
    if (!silent) emit(store);
    return obj;
  },
  async bulkPut(store, list) {
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const os = t.objectStore(store);
      for (const o of list) os.put(o);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
    emit(store);
  },
  async del(store, id, { tombstone = true } = {}) {
    await wrap((await tx(store, 'readwrite')).delete(id));
    if (tombstone && store !== 'deleted') {
      await wrap((await tx('deleted', 'readwrite')).put({ id: store + ':' + id, store, key: id, at: Date.now() }));
    }
    emit(store);
  },
  async clear(store) { await wrap((await tx(store, 'readwrite')).clear()); emit(store); },
  async count(store) { return wrap((await tx(store)).count()); },
};

export async function getSetting(key, fallback = null) {
  const row = await db.get('settings', key);
  return row ? row.value : fallback;
}
export async function setSetting(key, value, opts) {
  return db.put('settings', { key, value }, opts);
}
