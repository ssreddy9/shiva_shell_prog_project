// Tiny promise wrapper around IndexedDB. Everything the app stores lives here
// on the device. With cloud accounts, each person gets their own database on
// the device, and every write is queued in `outbox` for the sync engine
// (js/sync.js), which encrypts it before upload.

export const LEGACY_DB = 'lifelog'; // on-device mode (original name, kept so existing data survives)
let dbName = LEGACY_DB;
const VERSION = 2;

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
  outbox: [],                  // changes waiting to be synced (cloud accounts only)
};

// What syncs to the cloud: everything except bookkeeping stores and a few
// settings that only make sense on this device.
const NO_SYNC_STORES = new Set(['deleted', 'outbox']);
const LOCAL_SETTINGS = new Set(['lastBackup', 'seeded', 'highlightsMigrated', 'feedMode', 'syncCursor', 'lastSync']);
export const syncable = (store, key) => !NO_SYNC_STORES.has(store) && !(store === 'settings' && LOCAL_SETTINGS.has(key));

const KEYPATH = { days: 'date', settings: 'key' };

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, indexes] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const os = db.createObjectStore(name, { keyPath: KEYPATH[name] || 'id' });
        for (const ix of indexes) os.createIndex(ix, ix);
      }
    };
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

// Switch to another person's on-device database (cloud accounts).
export async function useDatabase(name) {
  if (name === dbName && dbp) return;
  if (dbp) (await dbp).close();
  dbName = name;
  dbp = null;
}
export const currentDatabase = () => dbName;
export function deleteDatabase(name) {
  return new Promise(resolve => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => resolve(); });
}
export async function databaseHasData(name) {
  const known = indexedDB.databases ? (await indexedDB.databases()).some(d => d.name === name) : true;
  if (!known) return false;
  return new Promise(resolve => {
    const r = indexedDB.open(name);
    r.onupgradeneeded = () => { r.transaction.abort(); resolve(false); };
    r.onerror = () => resolve(false);
    r.onsuccess = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('entries')) { d.close(); return resolve(false); }
      const stores = ['entries', 'money', 'vault'].filter(s => d.objectStoreNames.contains(s));
      const t = d.transaction(stores);
      let n = 0;
      stores.forEach(s => { const c = t.objectStore(s).count(); c.onsuccess = () => { n += c.result; }; });
      t.oncomplete = () => { d.close(); resolve(n > 0); };
    };
  });
}

// Photos synced from another device are downloaded on first view; the sync
// engine registers how (see js/sync.js).
let blobFetcher = null;
export function setBlobFetcher(fn) { blobFetcher = fn; }
export async function withBlob(store, rec) {
  if (rec && rec.remoteBlob && !rec.blob && !rec.ct && blobFetcher) return (await blobFetcher(store, keyOf(store, rec))) || rec;
  return rec;
}

// Read every store of another on-device database (used to bring the data
// from on-device mode into a new account).
export function readDatabase(name) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const d = r.result;
      const names = [...d.objectStoreNames].filter(n => n in STORES && n !== 'outbox' && n !== 'deleted');
      const out = {};
      const t = d.transaction(names);
      names.forEach(n => { const q = t.objectStore(n).getAll(); q.onsuccess = () => { out[n] = q.result; }; });
      t.oncomplete = () => { d.close(); resolve(out); };
      t.onerror = () => { d.close(); reject(t.error); };
    };
  });
}

// ---- sync bookkeeping: remember which records changed
let tracking = false;
export function setSyncTracking(on) { tracking = on; }
const outboxListeners = new Set();
export function onOutbox(fn) { outboxListeners.add(fn); }
async function enqueue(store, keys) {
  if (!tracking) return;
  const list = keys.filter(k => syncable(store, k));
  if (!list.length) return;
  const d = await open();
  await new Promise((resolve, reject) => {
    const t = d.transaction('outbox', 'readwrite');
    const os = t.objectStore('outbox');
    const at = Date.now();
    for (const key of list) os.put({ id: store + '\u0001' + key, store, key, at });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  for (const fn of outboxListeners) fn();
}
const keyOf = (store, obj) => obj[KEYPATH[store] || 'id'];

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
  async put(store, obj, { silent = false, keepTime = false, fromSync = false } = {}) {
    const now = Date.now();
    if (!KEYPATH[store] && !obj.id) obj.id = uid();
    if (!obj.createdAt) obj.createdAt = now;
    if (!keepTime) obj.updatedAt = now;
    await wrap((await tx(store, 'readwrite')).put(obj));
    if (!fromSync) await enqueue(store, [keyOf(store, obj)]);
    if (!silent) emit(store);
    return obj;
  },
  async bulkPut(store, list, { fromSync = false, silent = false } = {}) {
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const os = t.objectStore(store);
      for (const o of list) os.put(o);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
    if (!fromSync) await enqueue(store, list.map(o => keyOf(store, o)));
    if (!silent) emit(store);
  },
  async del(store, id, { tombstone = true, fromSync = false, silent = false } = {}) {
    await wrap((await tx(store, 'readwrite')).delete(id));
    if (!fromSync) await enqueue(store, [id]);
    if (tombstone && store !== 'deleted') {
      await wrap((await tx('deleted', 'readwrite')).put({ id: store + ':' + id, store, key: id, at: Date.now() }));
    }
    if (!silent) emit(store);
  },
  async clear(store) {
    const keys = tracking ? await wrap((await tx(store)).getAllKeys()) : [];
    await wrap((await tx(store, 'readwrite')).clear());
    await enqueue(store, keys);
    emit(store);
  },
  async keys(store) { return wrap((await tx(store)).getAllKeys()); },
  async count(store) { return wrap((await tx(store)).count()); },
};

export async function getSetting(key, fallback = null) {
  const row = await db.get('settings', key);
  return row ? row.value : fallback;
}
export async function setSetting(key, value, opts) {
  return db.put('settings', { key, value }, opts);
}
