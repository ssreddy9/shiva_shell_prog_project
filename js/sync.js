// Sync engine for cloud accounts.
//
// Local-first: the app always reads and writes the on-device database. Every
// write is queued in `outbox`; this engine encrypts queued records with the
// person's data key and uploads them, then downloads anything changed on their
// other devices. Conflicts: the most recent edit (updatedAt) wins, the same
// rule the backup import uses. Photos and scans are uploaded as separate
// encrypted files; photos from other devices download when first viewed.

import { db, STORES, onOutbox, getSetting, setSetting, setBlobFetcher, syncable } from './db.js';
import { remote } from './remote.js';
import { sealJSON, openJSON, sealBytes, openBytes, getDataKey } from './account.js';
import { ser, deser } from './backup.js';

const BLOB_FIELD = { media: 'blob', vaultfiles: 'ct' };
const KEYPATH = { days: 'date', settings: 'key' };
const keyOf = (store, rec) => rec[KEYPATH[store] || 'id'];
const aadRec = (store, key) => `rec/${store}/${key}`;
const aadBlob = (store, key) => `blob/${store}/${key}`;
const EPOCH = '1970-01-01T00:00:00.000Z';

let uid = null;
let running = false;
let rerun = false;
let timer = null;
let started = false;
const status = { state: 'idle', lastSync: null, error: null, pending: 0 };
const statusListeners = new Set();
export const syncStatus = () => ({ ...status });
export function onSyncStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(patch) { Object.assign(status, patch); for (const fn of statusListeners) fn(syncStatus()); }

const blobPath = (store, key) => `${uid}/${store}/${encodeURIComponent(key)}`;

export function startSync(userId) {
  uid = userId;
  setBlobFetcher(fetchBlob);
  if (!started) {
    started = true;
    onOutbox(() => schedule(1500));
    addEventListener('online', () => schedule(0));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(0); });
    setInterval(() => schedule(0), 60000);
  }
  getSetting('lastSync', null).then(t => setStatus({ lastSync: t }));
  return syncNow();
}
export function stopSync() { uid = null; clearTimeout(timer); setStatus({ state: 'idle', error: null }); }

export function schedule(ms) {
  if (!uid) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms);
}

export async function syncNow() {
  if (!uid || !getDataKey()) return;
  if (running) { rerun = true; return; }
  if (!navigator.onLine) { setStatus({ state: 'offline', pending: await db.count('outbox') }); return; }
  running = true;
  setStatus({ state: 'syncing', error: null });
  try {
    const r = await remote();
    await push(r);
    const changed = await pull(r);
    const now = Date.now();
    await setSetting('lastSync', now, { silent: true });
    setStatus({ state: 'synced', lastSync: now, pending: await db.count('outbox') });
    if (changed) dispatchEvent(new CustomEvent('synced', { detail: { changed } }));
  } catch (err) {
    console.warn('Sync failed', err);
    setStatus({ state: 'error', error: err.message || String(err), pending: await db.count('outbox').catch(() => 0) });
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(), 30000);
  } finally {
    running = false;
    if (rerun) { rerun = false; schedule(500); }
  }
}

// ---- upload ------------------------------------------------------------------
async function pack(r, store, key, rec) {
  const copy = { ...rec };
  let path = null;
  const field = BLOB_FIELD[store];
  if (field) {
    const v = rec[field];
    if (v) {
      const bytes = v instanceof Blob ? new Uint8Array(await v.arrayBuffer()) : new Uint8Array(v);
      path = blobPath(store, key);
      await r.uploadBlob(path, await sealBytes(bytes, aadBlob(store, key)));
      if (v instanceof Blob) copy.blobType = v.type;
    } else if (rec.remoteBlob) {
      path = rec.remoteBlob; // photo from another device not downloaded here; the file is already in the cloud
    }
    delete copy[field];
    delete copy.remoteBlob;
  }
  const sealed = await sealJSON(await ser(copy), aadRec(store, key));
  return { user_id: uid, store, key: String(key), client_updated: rec.updatedAt || 0, deleted: false, iv: sealed.iv, ct: sealed.ct, blob_path: path };
}

async function push(r) {
  const queued = await db.all('outbox');
  if (!queued.length) return;
  setStatus({ pending: queued.length });
  for (let i = 0; i < queued.length; i += 40) {
    const chunk = queued.slice(i, i + 40);
    const rows = [];
    const orphanBlobs = [];
    for (const item of chunk) {
      if (!syncable(item.store, item.key)) continue;
      const rec = await db.get(item.store, item.key);
      if (rec) rows.push(await pack(r, item.store, item.key, rec));
      else {
        rows.push({ user_id: uid, store: item.store, key: String(item.key), client_updated: item.at, deleted: true, iv: null, ct: null, blob_path: null });
        if (BLOB_FIELD[item.store]) orphanBlobs.push(blobPath(item.store, item.key));
      }
    }
    await r.pushRows(rows);
    if (orphanBlobs.length) await r.removeBlobs(orphanBlobs).catch(() => {});
    // Only clear queue entries that weren't touched again while uploading.
    for (const item of chunk) {
      const cur = await db.get('outbox', item.id);
      if (cur && cur.at === item.at) await db.del('outbox', item.id, { tombstone: false, fromSync: true, silent: true });
    }
    setStatus({ pending: Math.max(0, queued.length - i - chunk.length) });
  }
}

// ---- download ----------------------------------------------------------------
async function pull(r) {
  let cursor = await getSetting('syncCursor', EPOCH);
  let changed = 0;
  for (;;) {
    // Re-read a few seconds back so rows committed slightly out of order aren't missed.
    const since = new Date(Math.max(0, Date.parse(cursor) - 5000)).toISOString();
    const rows = await r.pullRows(since, 500);
    for (const row of rows) if (await apply(r, row)) changed++;
    if (rows.length) {
      const last = rows[rows.length - 1].server_updated;
      if (last === cursor && rows.length === 500) throw new Error('Too many changes at one instant');
      cursor = last;
      await setSetting('syncCursor', cursor, { silent: true });
    }
    if (rows.length < 500) break;
  }
  return changed;
}

async function apply(r, row) {
  const { store, key } = row;
  if (!(store in STORES) || !syncable(store, key)) return false;
  const local = await db.get(store, key);
  // A pending local edit newer than the server copy wins; it will upload next.
  if (local && (local.updatedAt || 0) >= row.client_updated) return false;
  if (row.deleted) {
    if (!local) return false;
    await db.del(store, key, { tombstone: false, fromSync: true, silent: true });
    return true;
  }
  const obj = deser(await openJSON(row.iv, row.ct, aadRec(store, key)));
  const field = BLOB_FIELD[store];
  if (field && row.blob_path) {
    obj.remoteBlob = row.blob_path;
    if (store === 'vaultfiles') {
      // Document scans are small and needed offline: fetch them now.
      obj.ct = await openBytes(await r.downloadBlob(row.blob_path), aadBlob(store, key));
      delete obj.remoteBlob;
    } else if (local && local[field] && local.updatedAt === obj.updatedAt) {
      obj[field] = local[field];
    }
  }
  delete obj.blobType;
  await db.put(store, obj, { keepTime: true, fromSync: true, silent: true });
  return true;
}

// Download a photo that was synced from another device (called on first view).
const inflight = new Map();
async function fetchBlob(store, key) {
  const id = store + '/' + key;
  if (inflight.has(id)) return inflight.get(id);
  const p = (async () => {
    const rec = await db.get(store, key);
    if (!rec || !rec.remoteBlob || !getDataKey() || !navigator.onLine) return rec;
    const r = await remote();
    const bytes = await openBytes(await r.downloadBlob(rec.remoteBlob), aadBlob(store, key));
    if (store === 'media') rec.blob = new Blob([bytes], { type: rec.type || 'image/jpeg' });
    else rec.ct = bytes;
    delete rec.remoteBlob;
    await db.put(store, rec, { keepTime: true, fromSync: true, silent: true });
    return rec;
  })().catch(err => { console.warn('Photo download failed', err); return null; }).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

// Everything still waiting to upload (used before signing out).
export async function pendingCount() { return db.count('outbox'); }
